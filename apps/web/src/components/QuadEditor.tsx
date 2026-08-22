import { useMemo } from 'react';
import { Circle, Line, Rect } from 'react-konva';
import type { Point, Quad } from '@genmockup/shared';

const CORNER_LABELS = ['TL', 'TR', 'BR', 'BL'];

/** Bezier bậc 2 — dùng chung công thức với backend (services/perspective.ts). */
function bez(P0: Point, C: Point, P2: Point, t: number): Point {
  return [
    (1 - t) * (1 - t) * P0[0] + 2 * t * (1 - t) * C[0] + t * t * P2[0],
    (1 - t) * (1 - t) * P0[1] + 2 * t * (1 - t) * C[1] + t * t * P2[1],
  ];
}

/**
 * Lưới Coons — bản rút gọn của backend để vẽ overlay. Phải khớp công thức, nếu lệch
 * thì lưới hiển thị sẽ không đúng chỗ design thực sự rơi vào.
 */
export function coonsGrid(corners: Quad, ctrl: Quad, N = 12, M = 8): Point[][] {
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
      const blx = (1 - u) * (1 - v) * TL[0] + u * (1 - v) * TR[0] + u * v * BR[0] + (1 - u) * v * BL[0];
      const bly = (1 - u) * (1 - v) * TL[1] + u * (1 - v) * TR[1] + u * v * BR[1] + (1 - u) * v * BL[1];
      row.push([
        (1 - v) * t[0] + v * b[0] + (1 - u) * l[0] + u * r[0] - blx,
        (1 - v) * t[1] + v * b[1] + (1 - u) * l[1] + u * r[1] - bly,
      ]);
    }
    grid.push(row);
  }
  return grid;
}

/** Độ lệch của control point so với trung điểm dây cung = độ cong cạnh (px). */
export function edgeBend(corners: Quad, ctrl: Quad): number[] {
  return ctrl.map((c, k) => {
    const a = corners[k];
    const b = corners[(k + 1) % 4];
    return Math.hypot(c[0] - (a[0] + b[0]) / 2, c[1] - (a[1] + b[1]) / 2);
  });
}

interface Props {
  corners: Quad;
  ctrl: Quad;
  onChange: (corners: Quad, ctrl: Quad) => void;
  /** nghịch đảo scale của Stage — giữ tay nắm to đều khi zoom ảnh */
  handleScale: number;
}

export function QuadEditor({ corners, ctrl, onChange, handleScale }: Props) {
  const grid = useMemo(() => coonsGrid(corners, ctrl), [corners, ctrl]);
  const r = 8 * handleScale;

  /** Kéo góc: 2 control point kề dịch theo nửa quãng để cạnh không giật. */
  const moveCorner = (i: number, p: Point) => {
    const dx = p[0] - corners[i][0];
    const dy = p[1] - corners[i][1];
    const nextCorners = corners.map((c, k) => (k === i ? p : c)) as Quad;
    const prev = (i + 3) % 4;
    const nextCtrl = ctrl.map((c, k) => {
      if (k === i || k === prev) return [c[0] + dx / 2, c[1] + dy / 2] as Point;
      return c;
    }) as Quad;
    onChange(nextCorners, nextCtrl);
  };

  const moveCtrl = (i: number, p: Point) => {
    onChange(corners, ctrl.map((c, k) => (k === i ? p : c)) as Quad);
  };

  return (
    <>
      {grid.map((row, j) => (
        <Line
          key={`h${j}`}
          points={row.flat()}
          stroke="rgba(56,214,255,0.35)"
          strokeWidth={handleScale}
          listening={false}
        />
      ))}
      {grid[0].map((_, i) => (
        <Line
          key={`v${i}`}
          points={grid.map((row) => row[i]).flat()}
          stroke="rgba(56,214,255,0.35)"
          strokeWidth={handleScale}
          listening={false}
        />
      ))}

      <Line
        points={corners.flat()}
        closed
        stroke="#0ea5e9"
        strokeWidth={2 * handleScale}
        listening={false}
      />

      {ctrl.map((c, i) => (
        <Rect
          key={`c${i}`}
          x={c[0]}
          y={c[1]}
          width={r * 1.6}
          height={r * 1.6}
          offsetX={r * 0.8}
          offsetY={r * 0.8}
          rotation={45}
          fill="#f59e0b"
          stroke="#fff"
          strokeWidth={handleScale}
          draggable
          onDragMove={(e) => moveCtrl(i, [e.target.x(), e.target.y()])}
          onMouseEnter={(e) => {
            const s = e.target.getStage();
            if (s) s.container().style.cursor = 'grab';
          }}
          onMouseLeave={(e) => {
            const s = e.target.getStage();
            if (s) s.container().style.cursor = 'default';
          }}
        />
      ))}

      {corners.map((p, i) => (
        <Circle
          key={`p${i}`}
          x={p[0]}
          y={p[1]}
          radius={r}
          fill="#0ea5e9"
          stroke="#fff"
          strokeWidth={1.5 * handleScale}
          draggable
          onDragMove={(e) => moveCorner(i, [e.target.x(), e.target.y()])}
          onMouseEnter={(e) => {
            const s = e.target.getStage();
            if (s) s.container().style.cursor = 'grab';
          }}
          onMouseLeave={(e) => {
            const s = e.target.getStage();
            if (s) s.container().style.cursor = 'default';
          }}
        />
      ))}
    </>
  );
}

export { CORNER_LABELS };
