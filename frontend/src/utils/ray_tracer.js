import * as THREE from 'three';

export class RayRefractionTracer {
  constructor(sspProfile) {
    this.ssp = sspProfile || [
      [0.0, 1450.0], [10.0, 1452.0], [25.0, 1458.0], [50.0, 1468.0],
      [75.0, 1478.0], [100.0, 1485.0], [150.0, 1492.0], [200.0, 1496.0],
    ];
    this._buildLUT();
  }

  _buildLUT() {
    const ds = this.ssp.map(p => p[0]);
    const cs = this.ssp.map(p => p[1]);
    this._minD = ds[0];
    this._maxD = ds[ds.length - 1];
    const n = ds.length;
    const h = [];
    const a = [];
    const b = [];
    const c = new Array(n).fill(0);
    const d_ = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) h[i] = ds[i + 1] - ds[i];
    const alpha = new Array(n).fill(0);
    for (let i = 1; i < n - 1; i++)
      alpha[i] = 3 * (cs[i + 1] - cs[i]) / h[i] - 3 * (cs[i] - cs[i - 1]) / h[i - 1];
    const l = new Array(n).fill(1);
    const mu = new Array(n).fill(0);
    const z = new Array(n).fill(0);
    for (let i = 1; i < n - 1; i++) {
      l[i] = 2 * (ds[i + 1] - ds[i - 1]) - h[i - 1] * mu[i - 1];
      mu[i] = h[i] / l[i];
      z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
    }
    for (let j = n - 2; j >= 0; j--) {
      c[j] = z[j] - mu[j] * c[j + 1];
      b[j] = (cs[j + 1] - cs[j]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3;
      d_[j] = (c[j + 1] - c[j]) / (3 * h[j]);
      a[j] = cs[j];
    }
    this._spline = { ds, a, b, c, d: d_, n };
  }

  soundSpeed(depth) {
    const { ds, a, b, c, d: d_coeff, n } = this._spline;
    let d = Math.max(this._minD, Math.min(this._maxD, depth));
    let i = 0;
    for (let k = 0; k < n - 1; k++) if (d >= ds[k]) i = k;
    const dx = d - ds[i];
    return a[i] + b[i] * dx + c[i] * dx * dx + d_coeff[i] * dx * dx * dx;
  }

  trace(tofSec, launchAngleRad, rovDepth, steps = 128) {
    const dt = tofSec / steps;
    const c0 = this.soundSpeed(rovDepth);
    const p = Math.cos(launchAngleRad) / c0;
    let x = 0, z = 0;
    let depth = rovDepth;
    let theta = launchAngleRad;
    for (let i = 0; i < steps; i++) {
      const c = this.soundSpeed(depth);
      let cosT = p * c;
      if (cosT > 1) cosT = 1;
      if (cosT < -1) cosT = -1;
      theta = Math.acos(cosT);
      const ds = c * dt;
      x += ds * Math.sin(theta);
      z += ds * Math.cos(theta);
      depth = rovDepth + z;
      if (depth < this._minD || depth > this._maxD) break;
    }
    return { x, z };
  }

  computeBeamPositions(ranges, depthDeltas, anglesRad, rovQuat, rovPos) {
    const n = ranges.length;
    const positions = new Float32Array(n * 3);
    const [qw, qx, qy, qz] = rovQuat;
    const q = new THREE.Quaternion(qx, qy, qz, qw).normalize();
    const mat = new THREE.Matrix4().makeRotationFromQuaternion(q);
    const origin = new THREE.Vector3(rovPos[0], rovPos[1], rovPos[2]);
    for (let i = 0; i < n; i++) {
      const r = ranges[i];
      const d = depthDeltas[i];
      const a = anglesRad[i];
      const local = new THREE.Vector3(
        r * Math.sin(a),
        d,
        -r * Math.cos(a)
      );
      local.applyMatrix4(mat);
      local.add(origin);
      positions[i * 3] = local.x;
      positions[i * 3 + 1] = local.y;
      positions[i * 3 + 2] = local.z;
    }
    return positions;
  }
}
