export class Delaunay2D {
  constructor(points = null) {
    this.triangles = [];
    this._superTriangle = null;
    if (points && points.length > 0) this.build(points);
  }

  _circumcircle(ax, ay, bx, by, cx, cy) {
    const dx = bx - ax, dy = by - ay;
    const ex = cx - ax, ey = cy - ay;
    const bl = dx * dx + dy * dy;
    const cl = ex * ex + ey * ey;
    const d = 0.5 / (dx * ey - dy * ex);
    const x = (ey * bl - dy * cl) * d;
    const y = (dx * cl - ex * bl) * d;
    const r2 = x * x + y * y;
    return { cx: x + ax, cy: y + ay, r2 };
  }

  build(points) {
    const n = points.length / 2;
    if (n < 3) { this.triangles = []; return; }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = points[i * 2], y = points[i * 2 + 1];
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }

    const dx = maxX - minX, dy = maxY - minY;
    const delta = Math.max(dx, dy) * 2;
    const cx = (minX + maxX) * 0.5, cy = (minY + maxY) * 0.5;

    const s0x = cx - delta, s0y = cy - delta;
    const s1x = cx + delta, s1y = cy - delta;
    const s2x = cx,       s2y = cy + delta * 2;
    this._superTriangle = [n, n + 1, n + 2];

    const allPts = new Float32Array((n + 3) * 2);
    for (let i = 0; i < n * 2; i++) allPts[i] = points[i];
    allPts[n * 2] = s0x; allPts[n * 2 + 1] = s0y;
    allPts[n * 2 + 2] = s1x; allPts[n * 2 + 3] = s1y;
    allPts[n * 2 + 4] = s2x; allPts[n * 2 + 5] = s2y;

    this._pts = allPts;

    const su = this._circumcircle(s0x, s0y, s1x, s1y, s2x, s2y);
    this.triangles = [{ a: n, b: n + 1, c: n + 2, cx: su.cx, cy: su.cy, r2: su.r2 }];

    for (let i = 0; i < n; i++) this._insertPoint(i);

    this.triangles = this.triangles.filter(t =>
      t.a < n && t.b < n && t.c < n
    );
  }

  _insertPoint(pi) {
    const px = this._pts[pi * 2], py = this._pts[pi * 2 + 1];
    const bad = [];
    for (let k = this.triangles.length - 1; k >= 0; k--) {
      const t = this.triangles[k];
      const ddx = px - t.cx, ddy = py - t.cy;
      if (ddx * ddx + ddy * ddy <= t.r2) {
        bad.push(k);
      }
    }

    const polygon = [];
    for (let k = 0; k < bad.length; k++) {
      const idx = bad[k];
      const t = this.triangles[idx];
      this._addEdge(polygon, t.a, t.b);
      this._addEdge(polygon, t.b, t.c);
      this._addEdge(polygon, t.c, t.a);
    }

    bad.sort((x, y) => y - x);
    for (let k = 0; k < bad.length; k++) this.triangles.splice(bad[k], 1);

    for (let k = 0; k < polygon.length; k += 2) {
      const a = polygon[k], b = polygon[k + 1];
      const ax = this._pts[a * 2], ay = this._pts[a * 2 + 1];
      const bx = this._pts[b * 2], by = this._pts[b * 2 + 1];
      const cc = this._circumcircle(ax, ay, bx, by, px, py);
      this.triangles.push({ a, b, c: pi, cx: cc.cx, cy: cc.cy, r2: cc.r2 });
    }
  }

  _addEdge(poly, a, b) {
    for (let k = poly.length - 2; k >= 0; k -= 2) {
      if ((poly[k] === a && poly[k + 1] === b) || (poly[k] === b && poly[k + 1] === a)) {
        poly.splice(k, 2);
        return;
      }
    }
    poly.push(a, b);
  }

  getTriangles() {
    const out = new Uint32Array(this.triangles.length * 3);
    for (let i = 0; i < this.triangles.length; i++) {
      const t = this.triangles[i];
      out[i * 3] = t.a; out[i * 3 + 1] = t.b; out[i * 3 + 2] = t.c;
    }
    return out;
  }
}

export function anisotropicInterpolate(sources, targetUV, sigmaUV = 0.8, sigmaDepth = 0.25) {
  const n = sources.length / 4;
  const tu = targetUV[0], tv = targetUV[1];
  let wsum = 0;
  let depth = 0;
  let confidence = 0;
  for (let i = 0; i < n; i++) {
    const su = sources[i * 4], sv = sources[i * 4 + 1];
    const sd = sources[i * 4 + 2], sc = sources[i * 4 + 3];
    const du = (tu - su) / (sigmaUV + 1e-5);
    const dv = (tv - sv) / (sigmaUV + 1e-5);
    const dist2 = du * du + dv * dv;
    const w = sc * Math.exp(-dist2 * 0.5);
    if (w < 1e-6) continue;
    wsum += w;
    depth += sd * w;
    confidence += sc * w;
  }
  if (wsum < 1e-5) return [0, 0];
  return [depth / wsum, Math.min(1, confidence / Math.max(1, wsum))];
}
