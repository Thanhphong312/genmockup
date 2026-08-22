import { useEffect, useState } from 'react';
import { Stage, Layer, Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';
import type { Area, ShirtSet } from '@genmockup/shared';
import { AlignControls, EditableBox } from './AreaEditor';
import { useElementWidth } from '../lib/useElementWidth';

const MAX_W = 340;
const MAX_H = 420;

interface Props {
  set: ShirtSet;
  designUrl: string | null;
  area: Area;
  onChange: (a: Area) => void;
  onReset: () => void;
}

export function ShirtSetPositioner({ set, designUrl, area, onChange, onReset }: Props) {
  const variant =
    set.variants.find((v) => v.color === set.representativeColor) || set.variants[0];
  const [bg] = useImage(variant?.fileUrl || '', 'anonymous');
  const [design] = useImage(designUrl || '', 'anonymous');
  const [selected, setSelected] = useState(false);
  const { ref: wrapRef, width: wrapW } = useElementWidth<HTMLDivElement>();

  const ratio = design && design.height ? design.width / design.height : null;

  // Khung luôn bám sát design: chiều cao do người dùng kéo, chiều rộng suy ra từ tỉ lệ
  // ảnh gốc (giữ nguyên tâm ngang). Composer cũng tính width y hệt → preview = output.
  useEffect(() => {
    if (!ratio) return;
    const want = Math.max(1, Math.round(area.height * ratio));
    if (Math.abs(want - area.width) <= 1) return;
    onChange({ ...area, x: Math.round(area.x + (area.width - want) / 2), width: want });
  }, [ratio, area, onChange]);

  if (!variant) return null;
  const W = variant.width;
  const H = variant.height;
  const avail = Math.min(wrapW || MAX_W, MAX_W);
  const scale = Math.min((avail || MAX_W) / W, MAX_H / H, 1);

  // Trước khi effect kịp đồng bộ width, vẫn vẽ theo tỉ lệ gốc quanh tâm area.
  const designH = area.height;
  const designW = ratio ? ratio * designH : area.width;

  return (
    <div className="rounded-lg border border-slate-200 p-2">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-xs font-medium truncate" title={set.name}>{set.name}</div>
        <button className="text-[11px] text-brand-600 hover:underline" onClick={onReset}>
          Đặt lại
        </button>
      </div>
      <AlignControls area={area} boundW={W} boundH={H} onChange={onChange} className="mb-1.5" />
      <div ref={wrapRef} className="bg-slate-50 rounded overflow-hidden">
        <Stage
          width={W * scale}
          height={H * scale}
          scaleX={scale}
          scaleY={scale}
          onMouseDown={(e) => {
            if (e.target === e.target.getStage()) setSelected(true);
          }}
        >
          <Layer>
            {bg && <KonvaImage image={bg} width={W} height={H} listening={false} />}
            {design && (
              <KonvaImage
                image={design}
                x={area.x + area.width / 2}
                y={area.y + area.height / 2}
                offsetX={designW / 2}
                offsetY={designH / 2}
                width={designW}
                height={designH}
                rotation={area.rotation}
                listening={false}
              />
            )}
            <EditableBox
              area={area}
              onChange={onChange}
              color="#3b82f6"
              selected={selected}
              onSelect={() => setSelected(true)}
            />
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
