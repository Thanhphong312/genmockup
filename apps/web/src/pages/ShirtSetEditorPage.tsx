import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stage, Layer, Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';
import { toast } from 'sonner';
import { ArrowLeft, Save } from 'lucide-react';
import type { Area } from '@genmockup/shared';
import { DESIGN_RATIO } from '@genmockup/shared';
import { getShirtSet, updateShirtSet } from '../api/shirtSets';
import { Button, Card, Input, Label, Spinner } from '../components/ui';
import { AlignControls, EditableBox, NumberFields } from '../components/AreaEditor';
import { useElementWidth } from '../lib/useElementWidth';

const MAX_STAGE_WIDTH = 720;
const MAX_STAGE_HEIGHT = 800;

export default function ShirtSetEditorPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();

  const { data: set, isLoading } = useQuery({
    queryKey: ['shirt-set', id],
    queryFn: () => getShirtSet(id!),
    enabled: !!id,
  });

  const [name, setName] = useState('');
  const [previewColor, setPreviewColor] = useState('');
  const [designArea, setDesignArea] = useState<Area | null>(null);
  const [watermarkArea, setWatermarkArea] = useState<Area | null>(null);
  const [hasWatermark, setHasWatermark] = useState(false);
  const [selected, setSelected] = useState<'design' | 'watermark' | null>('design');
  const { ref: canvasRef, width: canvasW } = useElementWidth<HTMLDivElement>();

  useEffect(() => {
    if (!set) return;
    setName(set.name);
    setPreviewColor(set.representativeColor || set.variants[0]?.color || '');
    setDesignArea(set.designArea);
    setHasWatermark(!!set.watermarkArea);
    const first = set.variants[0];
    setWatermarkArea(
      set.watermarkArea ||
        (first
          ? {
              x: Math.round(first.width * 0.7),
              y: Math.round(first.height * 0.85),
              width: Math.round(first.width * 0.2),
              height: Math.round(first.width * 0.2),
              rotation: 0,
            }
          : { x: 0, y: 0, width: 100, height: 100, rotation: 0 }),
    );
  }, [set]);

  const previewVariant = useMemo(
    () => set?.variants.find((v) => v.color === previewColor) || set?.variants[0],
    [set, previewColor],
  );

  const [image] = useImage(previewVariant?.fileUrl || '', 'anonymous');

  const saveMut = useMutation({
    mutationFn: () =>
      updateShirtSet(id!, {
        name,
        representativeColor: previewColor || undefined,
        designArea: designArea!,
        watermarkArea: hasWatermark ? watermarkArea : null,
      }),
    onSuccess: () => {
      toast.success('Đã lưu');
      qc.invalidateQueries({ queryKey: ['shirt-sets'] });
      qc.invalidateQueries({ queryKey: ['shirt-set', id] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  if (isLoading || !set || !designArea || !previewVariant) {
    return <div className="flex justify-center py-16"><Spinner /></div>;
  }

  const W = previewVariant.width;
  const H = previewVariant.height;
  const avail = Math.max((canvasW || MAX_STAGE_WIDTH) - 32, 120);
  const scale = Math.min(avail / W, MAX_STAGE_HEIGHT / H, 1);

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => nav('/shirt-sets')}>
            <ArrowLeft className="w-4 h-4" /> Quay lại
          </Button>
          <h1 className="text-xl font-bold">Sửa vị trí bộ áo</h1>
        </div>
        <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          {saveMut.isPending ? <Spinner /> : <Save className="w-4 h-4" />} Lưu vị trí
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <Card ref={canvasRef} className="p-4 flex justify-center items-center bg-slate-50 overflow-hidden">
          {image && (
            <Stage
              width={W * scale}
              height={H * scale}
              scaleX={scale}
              scaleY={scale}
              onMouseDown={(e) => {
                if (e.target === e.target.getStage()) setSelected(null);
              }}
            >
              <Layer>
                <KonvaImage image={image} width={W} height={H} listening={false} />
                <EditableBox
                  area={designArea}
                  onChange={setDesignArea}
                  color="#3b82f6"
                  lockRatio={DESIGN_RATIO}
                  selected={selected === 'design'}
                  onSelect={() => setSelected('design')}
                />
                {hasWatermark && watermarkArea && (
                  <EditableBox
                    area={watermarkArea}
                    onChange={setWatermarkArea}
                    color="#a855f7"
                    selected={selected === 'watermark'}
                    onSelect={() => setSelected('watermark')}
                  />
                )}
              </Layer>
            </Stage>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <Label>Tên bộ</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Card>

          <Card className="p-4">
            <Label>Màu xem trước / đại diện</Label>
            <select
              value={previewColor}
              onChange={(e) => setPreviewColor(e.target.value)}
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              {set.variants.map((v) => (
                <option key={v.id} value={v.color}>{v.color}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-2">
              Chỉ đổi ảnh nền để xem trước; vị trí design dùng chung cho mọi màu.
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-sm text-brand-600">Design area</div>
              <div className="text-xs text-slate-500">Lock 5:7</div>
            </div>
            <AlignControls area={designArea} boundW={W} boundH={H} onChange={setDesignArea} className="mb-3" />
            <NumberFields area={designArea} onChange={setDesignArea} />
          </Card>

          <Card className="p-4">
            <label className="flex items-center gap-2 mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hasWatermark}
                onChange={(e) => setHasWatermark(e.target.checked)}
              />
              <span className="font-semibold text-sm text-purple-600">Watermark area</span>
            </label>
            {hasWatermark && watermarkArea && (
              <NumberFields area={watermarkArea} onChange={setWatermarkArea} />
            )}
          </Card>

          <Card className="p-4 text-xs text-slate-500">
            <div>Kích thước mockup: <strong>{W}×{H}</strong> px · {set.variants.length} màu</div>
          </Card>
        </div>
      </div>
    </div>
  );
}
