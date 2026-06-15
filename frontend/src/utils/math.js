import * as THREE from 'three';

export class QuatMath {
  static quatToMat4(qw, qx, qy, qz) {
    const q = new THREE.Quaternion(qx, qy, qz, qw).normalize();
    const m = new THREE.Matrix4();
    m.makeRotationFromQuaternion(q);
    return m;
  }

  static applyQuatToVec3(qarr, vec) {
    const [w, x, y, z] = qarr;
    const vx = vec.x, vy = vec.y, vz = vec.z;
    const qv_x = x, qv_y = y, qv_z = z;
    const ix = w * vx + y * vz - z * vy;
    const iy = w * vy + z * vx - x * vz;
    const iz = w * vz + x * vy - y * vx;
    const iw = -x * vx - y * vy - z * vz;
    return new THREE.Vector3(
      ix * w + iw * (-x) + iy * (-z) - iz * (-y),
      iy * w + iw * (-y) + iz * (-x) - ix * (-z),
      iz * w + iw * (-z) + ix * (-y) - iy * (-x)
    );
  }
}

export class ColorMap {
  static JET(t) {
    const r = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - 3)));
    const g = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - 2)));
    const b = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - 1)));
    return new THREE.Color(r, g, b);
  }

  static INFERNO(t) {
    t = Math.max(0, Math.min(0.999, t));
    const x = t;
    const r = 0.0015 + 256.0 * (0.0255 + x * (0.4818 + x * (-0.5117 + x * 0.4583)));
    const g = 0.0010 + 256.0 * (0.0106 + x * (0.1810 + x * (0.4507 + x * -0.1146)));
    const b = 0.0008 + 256.0 * (0.0094 + x * (-0.1306 + x * (1.1209 + x * -0.9315)));
    return new THREE.Color(r / 255, g / 255, b / 255);
  }

  static VIRIDIS(t) {
    t = Math.max(0, Math.min(1, t));
    const samples = [
      [0.267, 0.004, 0.329],
      [0.282, 0.140, 0.458],
      [0.253, 0.265, 0.529],
      [0.206, 0.372, 0.553],
      [0.163, 0.471, 0.558],
      [0.127, 0.567, 0.551],
      [0.134, 0.658, 0.517],
      [0.267, 0.749, 0.441],
      [0.478, 0.821, 0.318],
      [0.741, 0.873, 0.150],
      [0.993, 0.906, 0.144],
    ];
    const p = t * (samples.length - 1);
    const i = Math.floor(p);
    const f = p - i;
    const a = samples[Math.min(i, samples.length - 1)];
    const b = samples[Math.min(i + 1, samples.length - 1)];
    return new THREE.Color(
      a[0] + (b[0] - a[0]) * f,
      a[1] + (b[1] - a[1]) * f,
      a[2] + (b[2] - a[2]) * f
    );
  }
}
