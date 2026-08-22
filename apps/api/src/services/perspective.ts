/**
 * Biến dạng phối cảnh + cong theo lưới Coons.
 *
 * Dùng cho card skin: vùng dán được tả bằng 4 góc THẬT (không phải chữ nhật xoay) + 4
 * control point Bezier bậc 2 cho 4 cạnh. Lưới được chia nhỏ, mỗi ô dùng 1 homography
 * riêng — ô đủ nhỏ nên xấp xỉ affine, ghép lại cho mặt cong mượt.
 */

export type Point = [number, number];
export type Quad = [Point, Point, Point, Point];

/** Độ mịn lưới. 48×32 đủ mượt cho ảnh ~1000px, chi phí không đáng kể. */
export const GRID_N = 48;
export const GRID_M = 32;

/** Giải ma trận homography 3x3 đưa src[i] → dst[i] (4 cặp điểm), khử Gauss 8x8. */
export function homography(src: Point[], dst: Point[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const n = 8;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    [b[c], b[p]] = [b[p], b[c]];
    const pv = A[c][c];
    for (let k = c; k < n; k++) A[c][k] /= pv;
    b[c] /= pv;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c];
      if (!f) continue;
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  return [b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], 1];
}

/** Nở vùng ra ngoài quanh tâm. Phần thừa bị mockup che nên nở là an toàn, giúp bịt kín viền. */
export function growQuad<T extends Point[]>(pts: T, k = 1.015): Point[] {
  const cx = pts.slice(0, 4).reduce((s, p) => s + p[0], 0) / 4;
  const cy = pts.slice(0, 4).reduce((s, p) => s + p[1], 0) / 4;
  return pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k] as Point);
}

const bez = (P0: Point, C: Point, P2: Point, t: number): Point => [
  (1 - t) * (1 - t) * P0[0] + 2 * t * (1 - t) * C[0] + t * t * P2[0],
  (1 - t) * (1 - t) * P0[1] + 2 * t * (1 - t) * C[1] + t * t * P2[1],
];

/**
 * Lưới Coons từ 4 cạnh cong.
 * corners: TL,TR,BR,BL — ctrl: control point của TL→TR, TR→BR, BR→BL, BL→TL.
 * Bezier bậc 2 đối xứng khi đảo chiều nên cạnh BR→BL dùng lại đúng control point cho BL→BR.
 */
export function coonsGrid(corners: Point[], ctrl: Point[], N = GRID_N, M = GRID_M): Point[][] {
  const [TL, TR, BR, BL] = corners;
  const top = (u: number) => bez(TL, ctrl[0], TR, u);
  const right = (v: number) => bez(TR, ctrl[1], BR, v);
  const bottom = (u: number) => bez(BL, ctrl[2], BR, u);
  const left = (v: number) => bez(TL, ctrl[3], BL, v);

  const grid: Point[][] = [];
  for (let j = 0; j <= M; j++) {
    const v = j / M;
    const row: Point[] = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const t = top(u);
      const b = bottom(u);
      const l = left(v);
      const r = right(v);
      const bl =
        (1 - u) * (1 - v) * TL[0] + u * (1 - v) * TR[0] + u * v * BR[0] + (1 - u) * v * BL[0];
      const bt =
        (1 - u) * (1 - v) * TL[1] + u * (1 - v) * TR[1] + u * v * BR[1] + (1 - u) * v * BL[1];
      row.push([
        (1 - v) * t[0] + v * b[0] + (1 - u) * l[0] + u * r[0] - bl,
        (1 - v) * t[1] + v * b[1] + (1 - u) * l[1] + u * r[1] - bt,
      ]);
    }
    grid.push(row);
  }
  return grid;
}

/**
 * Warp ảnh design (RGBA thô, DW×DH) vào lưới, trả canvas RGBA W×H trong suốt.
 *
 * LƯU Ý: design phải được thu nhỏ (Lanczos) về xấp xỉ cỡ vùng dán TRƯỚC khi gọi hàm này.
 * Nội suy bilinear không lọc trước khi thu nhỏ sẽ sinh vân sọc moiré khắp mặt thẻ.
 */
export function warpMesh(
  design: Buffer,
  DW: number,
  DH: number,
  grid: Point[][],
  W: number,
  H: number,
): Buffer {
  const out = Buffer.alloc(W * H * 4);
  const M = grid.length - 1;
  const N = grid[0].length - 1;

  for (let j = 0; j < M; j++) {
    for (let i = 0; i < N; i++) {
      const q: Point[] = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]];
      const du0 = (i / N) * DW;
      const du1 = ((i + 1) / N) * DW;
      const dv0 = (j / M) * DH;
      const dv1 = ((j + 1) / M) * DH;
      const Hi = homography(q, [
        [du0, dv0],
        [du1, dv0],
        [du1, dv1],
        [du0, dv1],
      ]);

      const xs = q.map((p) => p[0]);
      const ys = q.map((p) => p[1]);
      const x0 = Math.max(0, Math.floor(Math.min(...xs)) - 1);
      const x1 = Math.min(W - 1, Math.ceil(Math.max(...xs)) + 1);
      const y0 = Math.max(0, Math.floor(Math.min(...ys)) - 1);
      const y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)) + 1);

      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const w = Hi[6] * (x + 0.5) + Hi[7] * (y + 0.5) + Hi[8];
          const u = (Hi[0] * (x + 0.5) + Hi[1] * (y + 0.5) + Hi[2]) / w;
          const v = (Hi[3] * (x + 0.5) + Hi[4] * (y + 0.5) + Hi[5]) / w;
          // chỉ vẽ pixel thuộc đúng ô này (biên nới 0.5px để các ô khít nhau, không hở)
          if (u < du0 - 0.5 || u > du1 + 0.5 || v < dv0 - 0.5 || v > dv1 + 0.5) continue;
          if (u < 0 || v < 0 || u >= DW - 1 || v >= DH - 1) continue;

          const u0 = u | 0;
          const v0 = v | 0;
          const fu = u - u0;
          const fv = v - v0;
          const o = (y * W + x) * 4;
          for (let c = 0; c < 4; c++) {
            const i00 = (v0 * DW + u0) * 4 + c;
            const i10 = (v0 * DW + u0 + 1) * 4 + c;
            const i01 = ((v0 + 1) * DW + u0) * 4 + c;
            const i11 = ((v0 + 1) * DW + u0 + 1) * 4 + c;
            out[o + c] =
              design[i00] * (1 - fu) * (1 - fv) +
              design[i10] * fu * (1 - fv) +
              design[i01] * (1 - fu) * fv +
              design[i11] * fu * fv;
          }
        }
      }
    }
  }
  return out;
}

/** Kích thước cạnh của vùng dán (dùng để chọn cỡ thu nhỏ design + tính tỉ lệ). */
export function quadSize(corners: Point[]): { width: number; height: number; ratio: number } {
  const d = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const width = Math.max(d(corners[0], corners[1]), d(corners[3], corners[2]));
  const height = Math.max(d(corners[0], corners[3]), d(corners[1], corners[2]));
  return { width, height, ratio: height ? width / height : 0 };
}
