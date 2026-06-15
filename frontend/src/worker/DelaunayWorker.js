import { Delaunay2D, anisotropicInterpolate } from './delaunay_algo.js';

const CELL_SIZE = 1.5;

class DelaunayWorker {
  constructor() {
    this._counter = 0;
  }

  _buildSliceUV(points3D) {
    const n = points3D.length / 3;
    const uv = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      uv[i * 4] = points3D[i * 3];
      uv[i * 4 + 1] = points3D[i * 3 + 2];
      uv[i * 4 + 2] = points3D[i * 3 + 1];
      uv[i * 4 + 3] = 1.0;
    }
    return uv;
  }

  _key(x, z) {
    return (Math.floor(x / CELL_SIZE) | 0) + '_' + (Math.floor(z / CELL_SIZE) | 0);
  }

  _buildGrid(pointsUV) {
    const occ = new Map();
    const n = pointsUV.length / 4;
    for (let i = 0; i < n; i++) {
      const x = pointsUV[i * 4];
      const z = pointsUV[i * 4 + 1];
      const k = this._key(x, z);
      if (!occ.has(k)) occ.set(k, []);
      occ.get(k).push(i);
    }
    return occ;
  }

  _findNeighbors(pointsUV, occ, cx, cz, radius = 2) {
    const result = [];
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const k = this._key(cx + dx * CELL_SIZE, cz + dz * CELL_SIZE);
        const cell = occ.get(k);
        if (cell) { for (let c = 0; c < cell.length; c++) result.push(cell[c]); }
      }
    }
    return result;
  }

  _detectAndFill(pointsUV) {
    const occ = this._buildGrid(pointsUV);
    const fillPts = [];
    const checked = new Set();
    const originalN = pointsUV.length / 4;

    const keys = Array.from(occ.keys());
    for (let k = 0; k < keys.length; k++) {
      const [gxS, gzS] = keys[k].split('_').map(Number);
      const cx = (gxS + 0.5) * CELL_SIZE;
      const cz = (gzS + 0.5) * CELL_SIZE;
      let emptyNeighbors = 0;
      let filled = 0;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (dx === 0 && dz === 0) { filled++; continue; }
          const nk = (gxS + dx) + '_' + (gzS + dz);
          if (occ.has(nk)) filled++;
          else emptyNeighbors++;
        }
      }
      if (emptyNeighbors >= 2 && filled >= 4) {
        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            if (dx === 0 && dz === 0) continue;
            const nk = (gxS + dx) + '_' + (gzS + dz);
            if (occ.has(nk)) continue;
            if (checked.has(nk)) continue;
            checked.add(nk);
            const holeX = (gxS + dx + 0.5) * CELL_SIZE;
            const holeZ = (gzS + dz + 0.5) * CELL_SIZE;
            const edges = this._findNeighbors(pointsUV, occ, holeX, holeZ, 2);
            if (edges.length < 5) continue;
            const sources = new Float32Array(edges.length * 4);
            for (let e = 0; e < edges.length; e++) {
              const idx = edges[e];
              sources[e * 4] = pointsUV[idx * 4];
              sources[e * 4 + 1] = pointsUV[idx * 4 + 1];
              sources[e * 4 + 2] = pointsUV[idx * 4 + 2];
              sources[e * 4 + 3] = 1.0;
            }
            const samples = 3;
            for (let s = 0; s < samples; s++) {
              const jx = (Math.random() - 0.5) * CELL_SIZE * 0.85;
              const jz = (Math.random() - 0.5) * CELL_SIZE * 0.85;
              const [depth, conf] = anisotropicInterpolate(sources, [holeX + jx, holeZ + jz], CELL_SIZE * 1.1, 1.0);
              if (conf > 0.3) {
                fillPts.push(holeX + jx, holeZ + jz, depth, conf * 0.6);
              }
            }
          }
        }
      }
    }
    return fillPts;
  }

  processSlice(sliceData) {
    const { sliceId, points3D } = sliceData;
    if (!points3D || points3D.length < 18) return null;

    const base = this._buildSliceUV(points3D);
    const n = base.length / 4;
    const flat2D = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { flat2D[i * 2] = base[i * 4]; flat2D[i * 2 + 1] = base[i * 4 + 1]; }

    const fillPts = this._detectAndFill(base);
    const filledN = Math.floor(fillPts.length / 4);
    const totalN = n + filledN;

    const all2D = new Float32Array(totalN * 2);
    const all3D = new Float32Array(totalN * 4);
    for (let i = 0; i < n; i++) {
      all2D[i * 2] = flat2D[i * 2];
      all2D[i * 2 + 1] = flat2D[i * 2 + 1];
      all3D[i * 4] = base[i * 4];
      all3D[i * 4 + 1] = base[i * 4 + 1];
      all3D[i * 4 + 2] = base[i * 4 + 2];
      all3D[i * 4 + 3] = base[i * 4 + 3];
    }
    for (let i = 0; i < filledN; i++) {
      const bi = n + i;
      all2D[bi * 2] = fillPts[i * 4];
      all2D[bi * 2 + 1] = fillPts[i * 4 + 1];
      all3D[bi * 4] = fillPts[i * 4];
      all3D[bi * 4 + 1] = fillPts[i * 4 + 1];
      all3D[bi * 4 + 2] = fillPts[i * 4 + 2];
      all3D[bi * 4 + 3] = fillPts[i * 4 + 3];
    }

    const dt = new Delaunay2D(all2D);
    const triangles = dt.getTriangles();
    const triCount = triangles.length / 3;
    const filtered = [];
    for (let i = 0; i < triCount; i++) {
      const a = triangles[i * 3], b = triangles[i * 3 + 1], c = triangles[i * 3 + 2];
      const ax = all3D[a * 4], az = all3D[a * 4 + 1];
      const bx = all3D[b * 4], bz = all3D[b * 4 + 1];
      const cx = all3D[c * 4], cz = all3D[c * 4 + 1];
      const area = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax)) * 0.5;
      if (area > 0.08 && area < 40) filtered.push(a, b, c);
    }

    const nPts = all3D.length / 4;
    const outPoints = new Float32Array(nPts * 3);
    const outConf = new Float32Array(nPts);
    for (let i = 0; i < nPts; i++) {
      outPoints[i * 3] = all3D[i * 4];
      outPoints[i * 3 + 1] = all3D[i * 4 + 2];
      outPoints[i * 3 + 2] = all3D[i * 4 + 1];
      outConf[i] = all3D[i * 4 + 3];
    }

    return {
      sliceId,
      points: outPoints.buffer,
      indices: new Uint32Array(filtered).buffer,
      confidence: outConf.buffer,
      nPoints: nPts,
      nTriangles: Math.floor(filtered.length / 3),
      filledCount: filledN,
    };
  }
}

const worker = new DelaunayWorker();
self.onmessage = function (e) {
  const msg = e.data || {};
  const { type, payload } = msg;
  if (type === 'process') {
    const result = worker.processSlice(payload);
    if (result) {
      self.postMessage(
        { type: 'slice_done', payload: result },
        [result.points, result.indices, result.confidence]
      );
    }
  }
};
