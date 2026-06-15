import * as THREE from 'three';
import { SONAR_VERTEX_SHADER, SONAR_FRAGMENT_SHADER, GRID_VERTEX_SHADER, GRID_FRAGMENT_SHADER } from './shaders.js';
import { ColorMap } from '../utils/math.js';
import { RayRefractionTracer } from '../utils/ray_tracer.js';

const MAX_INSTANCES = 256 * 1000;

export class SonarCloud {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.tracer = new RayRefractionTracer();
    this.maxInstances = opts.maxInstances || MAX_INSTANCES;
    this.cursor = 0;
    this._buildPointCloud();
    this._buildSwathMesh();
  }

  _buildPointCloud() {
    const geo = new THREE.SphereGeometry(1, 8, 8);
    this.pointsMaterial = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: SONAR_VERTEX_SHADER,
      fragmentShader: SONAR_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.pointsMesh = new THREE.InstancedMesh(geo, this.pointsMaterial, this.maxInstances);
    this.pointsMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this.instColor = new Float32Array(this.maxInstances * 3);
    this.instAlpha = new Float32Array(this.maxInstances);
    this.instSize = new Float32Array(this.maxInstances);
    for (let i = 0; i < this.maxInstances; i++) {
      this.instAlpha[i] = 0;
      this.instSize[i] = 0.03;
    }
    this.pointsMesh.instanceColor = new THREE.InstancedBufferAttribute(this.instColor, 3);
    this.pointsMesh.geometry.setAttribute('instColor', new THREE.InstancedBufferAttribute(new Float32Array(this.maxInstances * 3), 3));
    this.pointsMesh.geometry.setAttribute('instAlpha', new THREE.InstancedBufferAttribute(this.instAlpha, 1));
    this.pointsMesh.geometry.setAttribute('instSize', new THREE.InstancedBufferAttribute(this.instSize, 1));

    this.dummy = new THREE.Object3D();
    this.scene.add(this.pointsMesh);
  }

  _buildSwathMesh() {
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
    this.swathMesh = new THREE.InstancedMesh(geo, this.swathMaterial, 4000);
    this.swathMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.swathCount = 0;
    this.swathDummy = new THREE.Object3D();
    this.scene.add(this.swathMesh);
  }

  pushPing(ping, t) {
    const beams = ping.beams;
    const n = beams.count;
    const angles = beams.angles_rad;
    const ranges = beams.ranges_m;
    const dDeltas = beams.depth_deltas_m;
    const intensity = beams.intensity;

    const positions = this.tracer.computeBeamPositions(
      ranges, dDeltas, angles, ping.rov.quat, ping.rov.pos
    );

    const maxRange = 50.0;
    for (let i = 0; i < n; i++) {
      const idx = (this.cursor + i) % this.maxInstances;
      const px = positions[i * 3];
      const py = positions[i * 3 + 1];
      const pz = positions[i * 3 + 2];
      this.dummy.position.set(px, py, pz);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.pointsMesh.setMatrixAt(idx, this.dummy.matrix);

      const rNorm = Math.min(1, ranges[i] / maxRange);
      const depthNorm = Math.min(1, Math.max(0, (py + 5) / 120));
      const c = ColorMap.VIRIDIS(0.2 + 0.7 * (1 - rNorm));
      const inten = intensity[i];
      c.r = Math.min(1, c.r + inten * 0.35);
      c.g = Math.min(1, c.g + inten * 0.15);
      this.instColor[idx * 3] = c.r;
      this.instColor[idx * 3 + 1] = c.g;
      this.instColor[idx * 3 + 2] = c.b;
      this.instAlpha[idx] = Math.min(1, 0.35 + inten * 0.55) * (0.55 + 0.45 * (1 - rNorm));
      this.instSize[idx] = 0.025 + 0.045 * inten;
    }

    this.pointsMesh.instanceMatrix.needsUpdate = true;
    const colorAttr = this.pointsMesh.geometry.getAttribute('instColor');
    colorAttr.array = this.instColor;
    colorAttr.needsUpdate = true;
    this.pointsMesh.geometry.getAttribute('instAlpha').needsUpdate = true;
    this.pointsMesh.geometry.getAttribute('instSize').needsUpdate = true;

    this._pushSwathStrips(positions, n, intensity, ranges, maxRange);
    this.cursor = (this.cursor + n) % this.maxInstances;
  }

  _pushSwathStrips(positions, n, intensity, ranges, maxRange) {
    const strips = Math.min(n - 1, 120);
    const base = this.swathCount;
    for (let i = 0; i < strips; i += 2) {
      if (base + i >= this.swathMesh.count) break;
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
      const roll = 0;
      const pitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));
      this.swathDummy.position.set(cx, cy, cz);
      this.swathDummy.rotation.set(pitch, yaw, roll);
      this.swathDummy.scale.set(len, Math.max(0.02, 0.05 + 0.05 * (1 - avgR / maxRange)), 1);
      this.swathDummy.updateMatrix();
      this.swathMesh.setMatrixAt(base + i, this.swathDummy.matrix);

      const c = ColorMap.VIRIDIS(0.15 + 0.7 * (1 - avgR / maxRange));
      c.r = Math.min(1, c.r + inten * 0.3);
      this.swathMesh.setColorAt(base + i, c);
    }
    this.swathCount = (base + strips) % this.swathMesh.count;
    this.swathMesh.instanceMatrix.needsUpdate = true;
    if (this.swathMesh.instanceColor) this.swathMesh.instanceColor.needsUpdate = true;
  }

  updateFade(dt) {
    for (let i = 0; i < this.maxInstances; i++) {
      if (this.instAlpha[i] > 0.002) this.instAlpha[i] = Math.max(0, this.instAlpha[i] - dt * 0.008);
    }
    this.pointsMesh.geometry.getAttribute('instAlpha').needsUpdate = true;
  }

  clearAll() {
    for (let i = 0; i < this.maxInstances; i++) this.instAlpha[i] = 0;
    this.pointsMesh.geometry.getAttribute('instAlpha').needsUpdate = true;
    this.swathCount = 0;
    const m = new THREE.Matrix4();
    for (let i = 0; i < this.swathMesh.count; i++) this.swathMesh.setMatrixAt(i, m);
    this.swathMesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.pointsMesh);
    this.scene.remove(this.swathMesh);
    this.pointsMesh.geometry.dispose();
    this.pointsMaterial.dispose();
    this.swathMesh.geometry.dispose();
    this.swathMaterial.dispose();
  }
}
