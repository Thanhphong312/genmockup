import { useEffect, useRef } from 'react';
import { Rect, Transformer } from 'react-konva';
import Konva from 'konva';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
} from 'lucide-react';
import type { Area } from '@genmockup/shared';
import { Input, Label } from './ui';
import { cn } from '../lib/cn';

interface BoxProps {
  area: Area;
  onChange: (next: Area) => void;
  color: string;
  lockRatio?: number;
  selected: boolean;
  onSelect: () => void;
}

export function EditableBox({ area, onChange, color, lockRatio, selected, onSelect }: BoxProps) {
  const rectRef = useRef<Konva.Rect>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (selected && trRef.current && rectRef.current) {
      trRef.current.nodes([rectRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [selected]);

  return (
    <>
      <Rect
        ref={rectRef}
        x={area.x}
        y={area.y}
        width={area.width}
        height={area.height}
        rotation={area.rotation}
        stroke={color}
        strokeWidth={2}
        dash={[8, 4]}
        fill={`${color}15`}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) => {
          onChange({ ...area, x: Math.round(e.target.x()), y: Math.round(e.target.y()) });
        }}
        onTransformEnd={() => {
          const node = rectRef.current;
          if (!node) return;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          let w = Math.max(20, node.width() * scaleX);
          let h = Math.max(20, node.height() * scaleY);
          if (lockRatio) {
            // Chỉ giữ tỉ lệ khi kéo GÓC (cả w và h đổi). Kéo CẠNH (chỉ 1 chiều đổi)
            // → free, ăn đúng kích thước mới.
            const EPS = 1;
            const dw = Math.abs(w - area.width);
            const dh = Math.abs(h - area.height);
            if (dw > EPS && dh > EPS) {
              if (dh > dw) w = h * lockRatio;
              else h = w / lockRatio;
            }
          }
          node.scaleX(1);
          node.scaleY(1);
          node.width(w);
          node.height(h);
          onChange({
            x: Math.round(node.x()),
            y: Math.round(node.y()),
            width: Math.round(w),
            height: Math.round(h),
            rotation: node.rotation(),
          });
        }}
      />
      {selected && (
        <Transformer
          ref={trRef}
          rotateEnabled
          keepRatio={false}
          enabledAnchors={[
            'top-left',
            'top-center',
            'top-right',
            'middle-left',
            'middle-right',
            'bottom-left',
            'bottom-center',
            'bottom-right',
          ]}
        />
      )}
    </>
  );
}

/**
 * Nút căn chỉnh khung design theo cạnh/giữa của canvas (boundW × boundH).
 */
export function AlignControls({
  area,
  boundW,
  boundH,
  onChange,
  className,
}: {
  area: Area;
  boundW: number;
  boundH: number;
  onChange: (a: Area) => void;
  className?: string;
}) {
  const set = (patch: Partial<Area>) => onChange({ ...area, ...patch });
  const btn =
    'p-1.5 rounded border border-slate-200 hover:bg-slate-100 text-slate-600 disabled:opacity-40';
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <button type="button" title="Trái" className={btn} onClick={() => set({ x: 0 })}>
        <ArrowLeftToLine className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        title="Giữa ngang"
        className={btn}
        onClick={() => set({ x: Math.round((boundW - area.width) / 2) })}
      >
        <AlignCenterHorizontal className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        title="Phải"
        className={btn}
        onClick={() => set({ x: Math.round(boundW - area.width) })}
      >
        <ArrowRightToLine className="w-3.5 h-3.5" />
      </button>
      <span className="w-px h-4 bg-slate-200 mx-0.5" />
      <button type="button" title="Trên" className={btn} onClick={() => set({ y: 0 })}>
        <ArrowUpToLine className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        title="Giữa dọc"
        className={btn}
        onClick={() => set({ y: Math.round((boundH - area.height) / 2) })}
      >
        <AlignCenterVertical className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        title="Dưới"
        className={btn}
        onClick={() => set({ y: Math.round(boundH - area.height) })}
      >
        <ArrowDownToLine className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function NumberFields({ area, onChange }: { area: Area; onChange: (a: Area) => void }) {
  const upd = (k: keyof Area, v: string) => {
    const n = parseFloat(v) || 0;
    onChange({ ...area, [k]: n });
  };
  return (
    <div className="grid grid-cols-2 gap-2 text-xs">
      <Field label="X" value={area.x} onChange={(v) => upd('x', v)} />
      <Field label="Y" value={area.y} onChange={(v) => upd('y', v)} />
      <Field label="Width" value={area.width} onChange={(v) => upd('width', v)} />
      <Field label="Height" value={area.height} onChange={(v) => upd('height', v)} />
      <div className="col-span-2">
        <Field label="Rotation" value={area.rotation} onChange={(v) => upd('rotation', v)} />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="!mb-0.5 !text-xs">{label}</Label>
      <Input
        type="number"
        value={Math.round(value * 100) / 100}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-xs"
      />
    </div>
  );
}
