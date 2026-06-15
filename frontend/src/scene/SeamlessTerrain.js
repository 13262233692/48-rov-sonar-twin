import * as THREE from 'three';
import { ColorMap } from '../utils/math.js';

const MAX_SLOTS = 800;
const MAX_VERTS_PER_SLOT = 2400;
const MAX_TRIS_PER_SLOT = 3600;
const MAX_VERTS = MAX_SLOTS * MAX_VERTS_PER_SLOT;
const MAX_TRIS = MAX_SLOTS * MAX_TRIS_PER_SLOT;

export class SeamlessTerrain {
  constructor(scene) {
    this.scene = scene;
    this.maxSlots = MAX_SLOTS;
    this.cursor = 0;
    this._slots = new Array(this.maxSlots).fill(null).map(() => ({ used: false, age: 0 }));
    this._dirtyMin = Infinity;
    this._dirtyMax = -1;
    this._dirtyIdxMin = Infinity;
    this._dirtyIdxMax = -1;
    this._buildGeometry();
    this._buildMaterial();
    this._buildMesh();
  }

  _buildGeometry() {
    const positions = new Float32Array(MAX_VERTS * 3);
    const normals = new Float32Array(MAX_VERTS * 3);
    const colors = new Float32Array(MAX_VERTS * 3);
    const alphas = new Float32Array(MAX_VERTS);
    const ages = new Float32Array(MAX_VERTS);
    const indices = new Uint32Array(MAX_TRIS * 3);

    this._positions = positions;
    this._normals = normals;
    this._colors = colors;
    this._alphas = alphas;
    this._ages = ages;
    this._indices = indices;
    this._slotBaseVert = new Int32Array(this.maxSlots);
    this._slotBaseIdx = new Int32Array(this.maxSlots);
    this._slotNVerts = new Int32Array(this.maxSlots);
    this._slotNIdx = new Int32Array(this.maxSlots);

    const geo = new THREE.BufferGeometry();
    const pa = new THREE.BufferAttribute(positions, 3);
    const na = new THREE.BufferAttribute(normals, 3);
    const ca = new THREE.BufferAttribute(colors, 3);
    const aa = new THREE.BufferAttribute(alphas, 1);
    const aga = new THREE.BufferAttribute(ages, 1);

    pa.setUsage(THREE.DynamicDrawUsage);
    na.setUsage(THREE.DynamicDrawUsage);
    ca.setUsage(THREE.DynamicDrawUsage);
    aa.setUsage(THREE.DynamicDrawUsage);
    aga.setUsage(THREE.DynamicDrawUsage);

    for (const a of [pa, na, ca, aa, aga]) a.needsUpdate = false;

    geo.setAttribute('position', pa);
    geo.setAttribute('normal', na);
    geo.setAttribute('instColor', ca);
    geo.setAttribute('instAlpha', aa);
    geo.setAttribute('instAge', aga);

    const ia = new THREE.BufferAttribute(indices, 1);
    ia.setUsage(THREE.DynamicDrawUsage);
    ia.needsUpdate = false;
    geo.setIndex(ia);

    geo.setDrawRange(0, 0);

    geo.computeBoundingSphere = () => {
      if (!geo.boundingSphere) geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 250);
      geo.boundingSphere.radius = 250;
    };

    this.geometry = geo;
    this._drawRange = 0;
  }

  _buildMaterial() {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTick: { value: 0 },
        uFadePerSec: { value: 0.018 },
      },
      vertexShader: `
        attribute vec3 instColor;
        attribute float instAlpha;
        attribute float instAge;
        uniform float uTick;
        uniform float uFadePerSec;
        varying vec3 vColor;
        varying float vAlpha;
        varying vec3 vWorldNormal;
        varying vec3 vViewDir;
        void main() {
          float age = uTick - instAge;
          float fade = clamp(1.0 - age * uFadePerSec, 0.0, 1.0);
          if (fade < 0.05) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            vAlpha = 0.0;
            return;
          }
          vColor = instColor;
          vAlpha = instAlpha * fade;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          vViewDir = normalize(cameraPosition - worldPos.xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        varying vec3 vWorldNormal;
        varying vec3 vViewDir;
        void main() {
          if (vAlpha < 0.02) discard;
          vec3 lightDir = normalize(vec3(0.3, 0.9, 0.5));
          float ndl = max(0.25, dot(vWorldNormal, lightDir));
          float rim = pow(max(0.0, 1.0 - dot(vViewDir, vWorldNormal)), 2.0);
          vec3 col = vColor * (0.35 + 0.65 * ndl) + rim * vec3(0.15, 0.35, 0.55);
          gl_FragColor = vec4(col, vAlpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
    });
  }

  _buildMesh() {
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  _allocateSlot(sliceId) {
    for (let i = 0; i < this.maxSlots; i++) {
      const idx = (this.cursor + i) % this.maxSlots;
      if (!this._slots[idx].used || this._slots[idx].age > 25) {
        this.cursor = (idx + 1) % this.maxSlots;
        this._slots[idx] = { used: true, age: 0, sliceId };
        return idx;
      }
    }
    return -1;
  }

  _recomputeNormalsForSlot(slot) {
    const baseVert = this._slotBaseVert[slot];
    const nV = this._slotNVerts[slot];
    const baseIdx = this._slotBaseIdx[slot];
    const nI = this._slotNIdx[slot];
    const pos = this._positions;
    const nrm = this._normals;

    for (let i = 0; i < nV; i++) {
      const vi = (baseVert + i) * 3;
      nrm[vi] = 0; nrm[vi + 1] = 0; nrm[vi + 2] = 0;
    }

    const tmpA = new THREE.Vector3();
    const tmpB = new THREE.Vector3();
    const tmpN = new THREE.Vector3();

    for (let t = 0; t < nI; t++) {
      const a = this._indices[baseIdx + t * 3] - baseVert;
      const b = this._indices[baseIdx + t * 3 + 1] - baseVert;
      const c = this._indices[baseIdx + t * 3 + 2] - baseVert;
      if (a < 0 || b < 0 || c < 0 || a >= nV || b >= nV || c >= nV) continue;

      const a0 = (baseVert + a) * 3, a1 = (baseVert + b) * 3, a2 = (baseVert + c) * 3;
      tmpA.set(pos[a1] - pos[a0], pos[a1 + 1] - pos[a0 + 1], pos[a1 + 2] - pos[a0 + 2]);
      tmpB.set(pos[a2] - pos[a0], pos[a2 + 1] - pos[a0 + 1], pos[a2 + 2] - pos[a0 + 2]);
      tmpN.crossVectors(tmpA, tmpB).normalize();
      if (!isFinite(tmpN.x)) tmpN.set(0, 1, 0);

      nrm[a0] += tmpN.x; nrm[a0 + 1] += tmpN.y; nrm[a0 + 2] += tmpN.z;
      nrm[a1] += tmpN.x; nrm[a1 + 1] += tmpN.y; nrm[a1 + 2] += tmpN.z;
      nrm[a2] += tmpN.x; nrm[a2 + 1] += tmpN.y; nrm[a2 + 2] += tmpN.z;
    }

    for (let i = 0; i < nV; i++) {
      const vi = (baseVert + i) * 3;
      const l = Math.sqrt(nrm[vi] ** 2 + nrm[vi + 1] ** 2 + nrm[vi + 2] ** 2) || 1;
      nrm[vi] /= l; nrm[vi + 1] /= l; nrm[vi + 2] /= l;
    }

    const vEnd = baseVert + nV;
    if (baseVert < this._dirtyMin) this._dirtyMin = baseVert;
    if (vEnd - 1 > this._dirtyMax) this._dirtyMax = vEnd - 1;
  }

  uploadSlice(result, tick) {
    const slot = this._allocateSlot(result.sliceId);
    if (slot < 0) return;

    const nPts = result.nPoints;
    const nTri = result.nTriangles;
    if (nPts === 0 || nTri === 0) return;

    let baseVert = -1;
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = Math.floor(Math.random() * (MAX_VERTS - nPts - 10));
      let ok = true;
      for (let s = 0; s < this.maxSlots; s++) {
        if (!this._slots[s].used || s === slot) continue;
        const sv = this._slotBaseVert[s];
        const sn = this._slotNVerts[s];
        if (candidate + nPts > sv && candidate < sv + sn) { ok = false; break; }
      }
      if (ok) { baseVert = candidate; break; }
    }
    if (baseVert < 0) return;

    let baseIdx = -1;
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = Math.floor(Math.random() * (MAX_TRIS - nTri - 10)) * 3;
      let ok = true;
      for (let s = 0; s < this.maxSlots; s++) {
        if (!this._slots[s].used || s === slot) continue;
        const sv = this._slotBaseIdx[s];
        const sn = this._slotNIdx[s] * 3;
        if (candidate + nTri * 3 > sv && candidate < sv + sn) { ok = false; break; }
      }
      if (ok) { baseIdx = candidate; break; }
    }
    if (baseIdx < 0) return;

    this._slotBaseVert[slot] = baseVert;
    this._slotBaseIdx[slot] = baseIdx;
    this._slotNVerts[slot] = nPts;
    this._slotNIdx[slot] = nTri;

    const pts = new Float32Array(result.points);
    const idx = new Uint32Array(result.indices);
    const conf = new Float32Array(result.confidence);

    for (let i = 0; i < nPts; i++) {
      const dvi = (baseVert + i) * 3;
      const svi = i * 3;
      this._positions[dvi] = pts[svi];
      this._positions[dvi + 1] = pts[svi + 1];
      this._positions[dvi + 2] = pts[svi + 2];
      const y = pts[svi + 1];
      const depthNorm = Math.min(1, Math.max(0, (y + 30) / 80));
      const c = ColorMap.VIRIDIS(0.1 + 0.75 * (1 - depthNorm * 0.6));
      const alphaBase = 0.4 + 0.55 * conf[i];
      this._colors[dvi] = c.r;
      this._colors[dvi + 1] = c.g;
      this._colors[dvi + 2] = c.b;
      this._alphas[baseVert + i] = Math.min(1, alphaBase);
      this._ages[baseVert + i] = tick;
    }

    for (let t = 0; t < nTri; t++) {
      const ti = baseIdx + t * 3;
      this._indices[ti] = baseVert + idx[t * 3];
      this._indices[ti + 1] = baseVert + idx[t * 3 + 1];
      this._indices[ti + 2] = baseVert + idx[t * 3 + 2];
    }

    if (baseVert < this._dirtyMin) this._dirtyMin = baseVert;
    if (baseVert + nPts - 1 > this._dirtyMax) this._dirtyMax = baseVert + nPts - 1;
    if (baseIdx / 3 < this._dirtyIdxMin) this._dirtyIdxMin = baseIdx / 3;
    if (baseIdx / 3 + nTri - 1 > this._dirtyIdxMax) this._dirtyIdxMax = baseIdx / 3 + nTri - 1;

    this._recomputeNormalsForSlot(slot);

    let maxIEnd = 0;
    for (let s = 0; s < this.maxSlots; s++) {
      if (!this._slots[s].used) continue;
      const end = this._slotBaseIdx[s] + this._slotNIdx[s] * 3;
      if (end > maxIEnd) maxIEnd = end;
    }
    this._drawRange = maxIEnd;
  }

  updateTick(dt) {
    this._tick += dt;
    if (!this._tick) this._tick = 0;
    this.material.uniforms.uTick.value = this._tick;
    for (let s = 0; s < this.maxSlots; s++) {
      if (this._slots[s].used) this._slots[s].age += dt;
    }
    this._flushDirty();
  }

  _flushDirty() {
    if (this._dirtyMin <= this._dirtyMax) {
      this.geometry.getAttribute('position').needsUpdate = true;
      this.geometry.getAttribute('normal').needsUpdate = true;
      this.geometry.getAttribute('instColor').needsUpdate = true;
      this.geometry.getAttribute('instAlpha').needsUpdate = true;
      this.geometry.getAttribute('instAge').needsUpdate = true;
      this._dirtyMin = Infinity;
      this._dirtyMax = -1;
    }
    if (this._dirtyIdxMin <= this._dirtyIdxMax) {
      this.geometry.getIndex().needsUpdate = true;
      this.geometry.setDrawRange(0, this._drawRange);
      this._dirtyIdxMin = Infinity;
      this._dirtyIdxMax = -1;
    }
  }

  clear() {
    for (let s = 0; s < this.maxSlots; s++) {
      this._slots[s] = { used: false, age: 0 };
    }
    this._drawRange = 0;
    this.geometry.setDrawRange(0, 0);
    this.geometry.getIndex().needsUpdate = true;
    this._dirtyMin = 0; this._dirtyMax = MAX_VERTS - 1;
    this._dirtyIdxMin = 0; this._dirtyIdxMax = MAX_TRIS - 1;
    this._flushDirty();
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
