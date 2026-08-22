/**
 * Dò vùng khoét rỗng (alpha = 0) trong ảnh mockup card skin → 4 góc thật + độ cong 4 cạnh.
 *
 * Cách làm: thành phần liên thông lớn nhất → truy vết biên → BAO LỒI → gán điểm về 4 cạnh
 * (bỏ vùng bo góc) → fit đường bền vững → giao 2 đường kề = góc sắc (ngoại suy qua chỗ bo góc).
 *
 * Vì sao dùng bao lồi chứ không phải biên thô: chỗ ngón tay / mép ví che vào mặt thẻ làm biên
 * lõm sâu vào trong; fit trên biên thô sẽ bám vào đường viền ngón tay (đo được sai tới 85px).
 * Bao lồi bắc cầu qua chỗ lõm bằng dây cung trùng đúng mép thẻ.
 */
import sharp from 'sharp';
import type { Point } from './perspective.js';
import { quadSize } from './perspective.js';

export interface HoleGeometry {
  width: number;
  height: number;
  corners: Point[];
  ctrl: Point[];
  ratio: number;
  /** độ lệch lớn nhất của mỗi cạnh so với đường thẳng (px). ~0 = cạnh thẳng. */
  bend: number[];
  holePx: number;
}

function largestComponent(mask: Uint8Array, W: number, H: number): Uint8Array {
  const seen = new Uint8Array(W * H);
  const stack = new Int32Array(W * H);
  let best: number[] | null = null;

  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || seen[s]) continue;
    let sp = 0;
    const cur: number[] = [];
    stack[sp++] = s;
    seen[s] = 1;
    while (sp) {
      const p = stack[--sp];
      cur.push(p);
      const x = p % W;
      const y = (p / W) | 0;
      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
      if (x < W - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
      if (y > 0 && mask[p - W] && !seen[p - W]) { seen[p - W] = 1; stack[sp++] = p - W; }
      if (y < H - 1 && mask[p + W] && !seen[p + W]) { seen[p + W] = 1; stack[sp++] = p + W; }
    }
    if (!best || cur.length > best.length) best = cur;
  }

  const out = new Uint8Array(W * H);
  if (best) for (const p of best) out[p] = 1;
  return out;
}

/** Moore boundary tracing → biên ngoài theo thứ tự */
function traceContour(g: Uint8Array, W: number, H: number): Point[] {
  let start = -1;
  for (let p = 0; p < W * H && start < 0; p++) if (g[p]) start = p;
  if (start < 0) return [];

  const N8: Point[] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H && g[y * W + x] ? 1 : 0);
  const sx = start % W;
  const sy = (start / W) | 0;
  const out: Point[] = [[sx, sy]];
  let cx = sx;
  let cy = sy;
  let dir = 6;

  for (let guard = 0; guard < 8 * W * H; guard++) {
    let found = false;
    for (let k = 0; k < 8; k++) {
      const d = (dir + 6 + k) % 8;
      const nx = cx + N8[d][0];
      const ny = cy + N8[d][1];
      if (at(nx, ny)) {
        cx = nx; cy = ny; dir = d;
        out.push([nx, ny]);
        found = true;
        break;
      }
    }
    if (!found || (cx === sx && cy === sy)) break;
  }
  return out;
}

function convexHull(pts: Point[]): Point[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o: Point, a: Point, b: Point) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Point[] = [];
  const up: Point[] = [];
  for (const q of p) {
    while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  lo.pop();
  up.pop();
  return lo.concat(up);
}

/** hình chữ nhật nhỏ nhất bao đa giác — chỉ dùng làm ước lượng hướng ban đầu */
function minAreaRect(hull: Point[]): Point[] {
  let best: { area: number; corners: Point[] } | null = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const ux = (b[0] - a[0]) / L;
    const uy = (b[1] - a[1]) / L;
    const vx = -uy;
    const vy = ux;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [x, y] of hull) {
      const u = x * ux + y * uy;
      const v = x * vx + y * vy;
      if (u < u0) u0 = u;
      if (u > u1) u1 = u;
      if (v < v0) v0 = v;
      if (v > v1) v1 = v;
    }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) {
      const P = (u: number, v: number): Point => [u * ux + v * vx, u * uy + v * vy];
      best = { area, corners: [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)] };
    }
  }
  const c = best!.corners;
  const cx = c.reduce((s, p) => s + p[0], 0) / 4;
  const cy = c.reduce((s, p) => s + p[1], 0) / 4;
  const ang = [...c].sort(
    (a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx),
  );
  const tl = ang.reduce((m, p) => (p[0] + p[1] < m[0] + m[1] ? p : m), ang[0]);
  const k = ang.indexOf(tl);
  return [ang[k], ang[(k + 1) % 4], ang[(k + 2) % 4], ang[(k + 3) % 4]];
}

interface Line { c: Point; d: Point; n: Point }

function fitLine(pts: Point[]): Line {
  const n = pts.length;
  let mx = 0, my = 0;
  for (const p of pts) { mx += p[0]; my += p[1]; }
  mx /= n; my /= n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of pts) {
    const dx = p[0] - mx;
    const dy = p[1] - my;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const d: Point = [Math.cos(theta), Math.sin(theta)];
  return { c: [mx, my], d, n: [-d[1], d[0]] };
}

const distTo = (L: Line, p: Point) => (p[0] - L.c[0]) * L.n[0] + (p[1] - L.c[1]) * L.n[1];

function robustLine(pts: Point[]): { L: Line; pts: Point[] } {
  let cur = pts;
  let L = fitLine(cur);
  for (let it = 0; it < 3; it++) {
    const res = cur.map((p) => Math.abs(distTo(L, p)));
    const sorted = [...res].sort((a, b) => a - b);
    const med = sorted[res.length >> 1];
    const madSorted = res.map((r) => Math.abs(r - med)).sort((a, b) => a - b);
    const mad = madSorted[res.length >> 1] || 1;
    const lim = Math.max(2.5, med + 3 * mad);
    const keep = cur.filter((p) => Math.abs(distTo(L, p)) <= lim);
    if (keep.length < 12 || keep.length === cur.length) break;
    cur = keep;
    L = fitLine(cur);
  }
  return { L, pts: cur };
}

function intersect(A: Line, B: Line): Point | null {
  const det = A.d[0] * -B.d[1] - A.d[1] * -B.d[0];
  if (Math.abs(det) < 1e-9) return null;
  const rx = B.c[0] - A.c[0];
  const ry = B.c[1] - A.c[1];
  const t = (rx * -B.d[1] - ry * -B.d[0]) / det;
  return [A.c[0] + t * A.d[0], A.c[1] + t * A.d[1]];
}

/** control point Bezier bậc 2 cho 1 cạnh, 2 đầu cố định ở 2 góc */
function bezierCtrl(P0: Point, P2: Point, pts: Point[]): Point {
  const dx = P2[0] - P0[0];
  const dy = P2[1] - P0[1];
  const L2 = dx * dx + dy * dy || 1;
  let n0 = 0, n1 = 0, den = 0;
  for (const p of pts) {
    const t = ((p[0] - P0[0]) * dx + (p[1] - P0[1]) * dy) / L2;
    if (t <= 0.02 || t >= 0.98) continue;
    const w = 2 * t * (1 - t);
    n0 += w * (p[0] - (1 - t) * (1 - t) * P0[0] - t * t * P2[0]);
    n1 += w * (p[1] - (1 - t) * (1 - t) * P0[1] - t * t * P2[1]);
    den += w * w;
  }
  if (den < 1e-6) return [(P0[0] + P2[0]) / 2, (P0[1] + P2[1]) / 2];
  return [n0 / den, n1 / den];
}

const CORNER_CUT = 0.14; // bỏ 14% ở 2 đầu mỗi cạnh để tránh vùng bo góc

/** Dò vùng khoét từ buffer ảnh PNG có alpha. Ném lỗi nếu ảnh không có vùng rỗng. */
export async function detectHole(buffer: Buffer): Promise<HoleGeometry> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;

  const mask = new Uint8Array(W * H);
  let holePx = 0;
  for (let p = 0; p < W * H; p++) {
    if (data[p * 4 + 3] < 8) { mask[p] = 1; holePx++; }
  }
  if (holePx < 200) throw new Error('no_transparent_hole');

  // File DESIGN cũng có vùng trong suốt (lỗ khoét chip + 4 góc bo) nên sẽ lọt qua mọi
  // kiểm tra theo diện tích. Dấu hiệu chắc chắn: ảnh design chính LÀ cái thẻ, nên 4 góc
  // ảnh đều trong suốt do bo góc. Mockup thì 4 góc là nền ảnh chụp, luôn đục.
  const cornerAlpha = [
    data[3],
    data[(W - 1) * 4 + 3],
    data[((H - 1) * W) * 4 + 3],
    data[((H - 1) * W + W - 1) * 4 + 3],
  ];
  if (cornerAlpha.every((a) => a < 8)) throw new Error('looks_like_design');

  const component = largestComponent(mask, W, H);
  let compPx = 0;
  for (let p = 0; p < W * H; p++) if (component[p]) compPx++;
  // vùng khoét mặt thẻ luôn chiếm phần đáng kể khung hình; nhỏ hơn 1.5% gần như chắc chắn
  // là lỗ chip của file design hoặc một mảng trong suốt vụn nào đó
  if (compPx / (W * H) < 0.015) throw new Error('hole_too_small');

  const contour = traceContour(component, W, H);
  if (contour.length < 40) throw new Error('hole_too_small');

  const hull = convexHull(contour);
  const rect = minAreaRect(hull);
  const cx = rect.reduce((s, p) => s + p[0], 0) / 4;
  const cy = rect.reduce((s, p) => s + p[1], 0) / 4;

  // rải điểm dày dọc bao lồi rồi gán về 4 cạnh của ước lượng ban đầu
  const src: Point[] = [];
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const steps = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1])));
    for (let s = 0; s < steps; s++) {
      src.push([a[0] + ((b[0] - a[0]) * s) / steps, a[1] + ((b[1] - a[1]) * s) / steps]);
    }
  }

  const buckets: Point[][] = [[], [], [], []];
  for (const p of src) {
    let bi = 0, bd = Infinity, bt = 0;
    for (let k = 0; k < 4; k++) {
      const a = rect[k];
      const b = rect[(k + 1) % 4];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const L2 = dx * dx + dy * dy || 1;
      const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
      const d = Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
      if (d < bd) { bd = d; bi = k; bt = t; }
    }
    if (bt > CORNER_CUT && bt < 1 - CORNER_CUT) buckets[bi].push(p);
  }
  if (buckets.some((b) => b.length < 12)) throw new Error('hole_shape_unclear');

  const lines = buckets.map(robustLine);
  const corners: Point[] = [];
  for (let k = 0; k < 4; k++) {
    const ip = intersect(lines[(k + 3) % 4].L, lines[k].L);
    corners.push(ip ? [Math.round(ip[0]), Math.round(ip[1])] : rect[k]);
  }

  const ctrl = corners.map((c, k) => bezierCtrl(c, corners[(k + 1) % 4], lines[k].pts));
  const bend = lines.map(({ L, pts }) => {
    let mx = 0;
    for (const p of pts) {
      const d = distTo(L, p);
      if (Math.abs(d) > Math.abs(mx)) mx = d;
    }
    const outward = (L.c[0] - cx) * L.n[0] + (L.c[1] - cy) * L.n[1];
    return +(mx * Math.sign(outward || 1)).toFixed(1);
  });

  return { width: W, height: H, corners, ctrl, ratio: +quadSize(corners).ratio.toFixed(3), bend, holePx };
}
