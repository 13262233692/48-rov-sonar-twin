import * as THREE from 'three';
import { SONAR_VERTEX_SHADER, SONAR_FRAGMENT_SHADER, GRID_VERTEX_SHADER, GRID_FRAGMENT_SHADER } from './shaders.js';
import { ColorMap } from '../utils/math.js';
import { RayRefractionTracer } from '../utils/ray_tracer.js';

const MAX_POINTS = 256 * 2400;
const MAX_SWATH = 256 * 1200;

export class SonarCloud {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.tracer = new RayRefractionTracer();
    this.maxPoints = opts.maxPoints || MAX_POINTS;
    this.maxSwath = opts.maxSwath || MAX_SWATH;
    this.cursor = 0;
    this.swathCursor = 0;
    this.tick = 0;
    this._dirtyPointMin = Infinity;
    this._dirtyPointMax = -1;
    this._dirtySwathMin = Infinity;
    this._dirtySwathMax = -1;
    this._fadeAccum = 0;
    this._buildPointCloud();
    this._buildSwathMesh();
  }

  _buildPointCloud() {
    const N = this.maxPoints;
    const positions = new Float32Array(N * 3);
    const colors = new Float32Array(N * 3);
    const alphas = new Float32Array(N);
    const sizes = new Float32Array(N);
    const ages = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      alphas[i] = 0;
      sizes[i] = 0.0;
      ages[i] = 1e9;
    }

    this._positions = positions;
    this._colors = colors;
    this._alphas = alphas;
    this._sizes = sizes;
    this._ages = ages;

    const geometry = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(positions, 3);
    const colAttr = new THREE.BufferAttribute(colors, 3);
    const alphaAttr = new THREE.BufferAttribute(alphas, 1);
    const sizeAttr = new THREE.BufferAttribute(sizes, 1);
    const ageAttr = new THREE.BufferAttribute(ages, 1);

    posAttr.setUsage(THREE.DynamicDrawUsage);
    colAttr.setUsage(THREE.DynamicDrawUsage);
    alphaAttr.setUsage(THREE.DynamicDrawUsage);
    sizeAttr.setUsage(THREE.DynamicDrawUsage);
    ageAttr.setUsage(THREE.DynamicDrawUsage);

    posAttr.needsUpdate = false;
    colAttr.needsUpdate = false;
    alphaAttr.needsUpdate = false;
    sizeAttr.needsUpdate = false;
    ageAttr.needsUpdate = false;

    geometry.setAttribute('position', posAttr);
    geometry.setAttribute('instColor', colAttr);
    geometry.setAttribute('instAlpha', alphaAttr);
    geometry.setAttribute('instSize', sizeAttr);
    geometry.setAttribute('instAge', ageAttr);

    geometry.setDrawRange(0, N);
    geometry.computeBoundingSphere = () => {
      if (!geometry.boundingSphere) geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200);
      geometry.boundingSphere.radius = 200;
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTick: { value: 0 },
        uFadePerSec: { value: 0.08 },
      },
      vertexShader: `
        attribute vec3 instColor;
        attribute float instAlpha;
        attribute float instSize;
        attribute float instAge;
        uniform float uTick;
        uniform float uFadePerSec;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vDepth;
        void main() {
          float age = uTick - instAge;
          float alive = step(0.0, instAlpha) * step(age * uFadePerSec, 1.0);
          if (alive < 0.5) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            gl_PointSize = 0.0;
            vAlpha = 0.0;
            vColor = vec3(0.0);
            return;
          }
          float fade = clamp(1.0 - age * uFadePerSec, 0.0, 1.0);
          vColor = instColor;
          vAlpha = instAlpha * fade;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vDepth = -mvPosition.z;
          gl_PointSize = clamp(instSize * (520.0 / max(0.1, vDepth)), 1.0, 26.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: SONAR_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.pointsMesh = new THREE.Points(geometry, this.material);
    this.pointsMesh.frustumCulled = false;
    this.scene.add(this.pointsMesh);
  }

  _buildSwathMesh() {
    const N = this.maxSwath;
    const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
    this.swathMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uBeamColor: { value: new THREE.Color(0x00e5ff) },
        uAlpha: { value: 0.18 },
      },
      vertexShader: GRID_VERTEX_SHADER,
      fragmentShader: GRID_FRAGMENT_SHADER,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.swathMesh = new THREE.InstancedMesh(geo, this.swathMaterial, N);
    this.swathMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.swathMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    this.swathMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.swathMesh.instanceMatrix.needsUpdate = false;
    this.swathMesh.instanceColor.needsUpdate = false;
    this.swathMesh.frustumCulled = false;

    this._swathAges = new Float32Array(N);
    for (let i = 0; i < N; i++) this._swathAges[i] = 1e9;

    this.swathDummy = new THREE.Object3D();
    this._zeroMat = new THREE.Matrix4();
    this._zeroColor = new THREE.Color(0, 0, 0);

    this.scene.add(this.swathMesh);
  }

  _markPointDirty(i) {
    if (i < this._dirtyPointMin) this._dirtyPointMin = i;
    if (i > this._dirtyPointMax) this._dirtyPointMax = i;
  }

  _markSwathDirty(i) {
    if (i < this._dirtySwathMin) this._dirtySwathMin = i;
    if (i > this._dirtySwathMax) this._dirtySwathMax = i;
  }

  pushPing(ping) {
    const beams = ping.beams;
    const n = beams.count;
    if (n <= 0) return;
    const angles = beams.angles_rad;
    const ranges = beams.ranges_m;
    const dDeltas = beams.depth_deltas_m;
    const intensity = beams.intensity;

    const positions = this.tracer.computeBeamPositions(
      ranges, dDeltas, angles, ping.rov.quat, ping.rov.pos
    );

    const maxRange = 50.0;
    const nowTick = this.tick;
    const start = this.cursor;
    const end = start + n;
    const N = this.maxPoints;

    const posAttr = this.pointsMesh.geometry.getAttribute('position');
    const colAttr = this.pointsMesh.geometry.getAttribute('instColor');
    const alphaAttr = this.pointsMesh.geometry.getAttribute('instAlpha');
    const sizeAttr = this.pointsMesh.geometry.getAttribute('instSize');
    const ageAttr = this.pointsMesh.geometry.getAttribute('instAge');

    for (let i = 0; i < n; i++) {
      const ringIdx = (start + i) % N;
      const px = positions[i * 3];
      const py = positions[i * 3 + 1];
      const pz = positions[i * 3 + 2];
      posAttr.setXYZ(ringIdx, px, py, pz);

      const rNorm = Math.min(1, ranges[i] / maxRange);
      const c = ColorMap.VIRIDIS(0.2 + 0.7 * (1 - rNorm));
      const inten = intensity[i];
      colAttr.setXYZ(
        ringIdx,
        Math.min(1, c.r + inten * 0.35),
        Math.min(1, c.g + inten * 0.15),
        c.b
      );
      alphaAttr.setX(ringIdx, Math.min(1, 0.35 + inten * 0.55) * (0.55 + 0.45 * (1 - rNorm)));
      sizeAttr.setX(ringIdx, 0.04 + 0.18 * inten);
      ageAttr.setX(ringIdx, nowTick);
      this._markPointDirty(ringIdx);
    }

    this._pushSwathStrips(positions, n, intensity, ranges, maxRange, nowTick);
    this.cursor = end % N;
  }

  _pushSwathStrips(positions, n, intensity, ranges, maxRange, nowTick) {
    const strips = Math.min(n - 1, 255);
    if (strips <= 0) return;
    const N = this.maxSwath;
    const start = this.swathCursor;
    for (let i = 0; i < strips; i++) {
      const ringIdx = (start + i) % N;
      const a = i;
      const b = i + 1;
      const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
      const bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
      const cx = (ax + bx) * 0.5, cy = (ay + by) * 0.5, cz = (az + bz) * 0.5;
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-5;
      const avgR = (ranges[a] + ranges[b]) * 0.5;
      const inten = (intensity[a] + intensity[b]) * 0.5;
      const yaw = Math.atan2(dx, dz);
      const pitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));
      this.swathDummy.position.set(cx, cy, cz);
      this.swathDummy.rotation.set(pitch, yaw, 0);
      this.swathDummy.scale.set(len, Math.max(0.02, 0.06 + 0.08 * (1 - avgR / maxRange)), 1);
      this.swathDummy.updateMatrix();
      this.swathMesh.setMatrixAt(ringIdx, this.swathDummy.matrix);

      const c = ColorMap.VIRIDIS(0.15 + 0.7 * (1 - Math.min(1, avgR / maxRange)));
      c.r = Math.min(1, c.r + inten * 0.3);
      this.swathMesh.setColorAt(ringIdx, c);
      this._swathAges[ringIdx] = nowTick;
      this._markSwathDirty(ringIdx);
    }
    this.swathCursor = (start + strips) % N;
  }

  updateFade(dt) {
    this.tick += dt;
    this.material.uniforms.uTick.value = this.tick;
    this._fadeAccum += dt;
    if (this._fadeAccum >= 0.8) {
      this._fadeAccum = 0;
      this._recycleOldSwaths();
    }
    this._flushDirty();
  }

  _recycleOldSwaths() {
    const threshold = this.tick - 15;
    const N = this.maxSwath;
    const checked = Math.min(N, 800);
    const stride = Math.max(1, Math.floor(N / checked));
    for (let i = 0; i < N; i += stride) {
      if (this._swathAges[i] < threshold) {
        this.swathMesh.setMatrixAt(i, this._zeroMat);
        this.swathMesh.setColorAt(i, this._zeroColor);
        this._markSwathDirty(i);
      }
    }
  }

  _flushDirty() {
    if (this._dirtyPointMin <= this._dirtyPointMax) {
      this.pointsMesh.geometry.getAttribute('position').needsUpdate = true;
      this.pointsMesh.geometry.getAttribute('instColor').needsUpdate = true;
      this.pointsMesh.geometry.getAttribute('instAlpha').needsUpdate = true;
      this.pointsMesh.geometry.getAttribute('instSize').needsUpdate = true;
      this.pointsMesh.geometry.getAttribute('instAge').needsUpdate = true;
      this._dirtyPointMin = Infinity;
      this._dirtyPointMax = -1;
    }
    if (this._dirtySwathMin <= this._dirtySwathMax) {
      this.swathMesh.instanceMatrix.needsUpdate = true;
      if (this.swathMesh.instanceColor) this.swathMesh.instanceColor.needsUpdate = true;
      this._dirtySwathMin = Infinity;
      this._dirtySwathMax = -1;
    }
  }

  clearAll() {
    const N = this.maxPoints;
    const alphaAttr = this.pointsMesh.geometry.getAttribute('instAlpha');
    const ageAttr = this.pointsMesh.geometry.getAttribute('instAge');
    for (let i = 0; i < N; i++) {
      alphaAttr.setX(i, 0);
      ageAttr.setX(i, 1e9);
    }
    this._dirtyPointMin = 0;
    this._dirtyPointMax = N - 1;

    const SN = this.maxSwath;
    for (let i = 0; i < SN; i++) {
      this.swathMesh.setMatrixAt(i, this._zeroMat);
      this.swathMesh.setColorAt(i, this._zeroColor);
      this._swathAges[i] = 1e9;
    }
    this._dirtySwathMin = 0;
    this._dirtySwathMax = SN - 1;
    this.cursor = 0;
    this.swathCursor = 0;
    this._flushDirty();
  }

  dispose() {
    this.scene.remove(this.pointsMesh);
    this.scene.remove(this.swathMesh);
    this.pointsMesh.geometry.dispose();
    this.material.dispose();
    this.swathMesh.geometry.dispose();
    this.swathMaterial.dispose();
  }
}
