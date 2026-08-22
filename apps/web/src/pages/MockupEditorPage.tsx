import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stage, Layer, Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';
import { toast } from 'sonner';
import { ArrowLeft, Save, Upload } from 'lucide-react';
import type { Area } from '@genmockup/shared';
import { DESIGN_RATIO } from '@genmockup/shared';
import { getMockup, updateMockup, replaceMockupFile } from '../api/mockups';
import { Button, Card, Input, Label, Spinner } from '../components/ui';
import { AlignControls, EditableBox, NumberFields } from '../components/AreaEditor';
import { useElementWidth } from '../lib/useElementWidth';

const MAX_STAGE_WIDTH = 720;
const MAX_STAGE_HEIGHT = 800;

export default function MockupEditorPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();

  const { data: mockup, isLoading } = useQuery({
    queryKey: ['mockup', id],
    queryFn: () => getMockup(id!),
    enabled: !!id,
  });

  const [image] = useImage(mockup?.fileUrl || '', 'anonymous');

  const [designArea, setDesignArea] = useState<Area | null>(null);
  const [watermarkArea, setWatermarkArea] = useState<Area | null>(null);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<'design' | 'watermark' | null>('design');
  const [hasWatermark, setHasWatermark] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { ref: canvasRef, width: canvasW } = useElementWidth<HTMLDivElement>();

  useEffect(() => {
    if (!mockup) return;
    setName(mockup.name);
    setDesignArea(mockup.designArea);
    setHasWatermark(!!mockup.watermarkArea);
    setWatermarkArea(
      mockup.watermarkArea || {
        x: Math.round(mockup.width * 0.7),
        y: Math.round(mockup.height * 0.85),
        width: Math.round(mockup.width * 0.2),
        height: Math.round(mockup.width * 0.2),
        rotation: 0,
      },
    );
  }, [mockup]);

  const saveMut = useMutation({
    mutationFn: () =>
      updateMockup(id!, {
        name,
        designArea: designArea!,
        watermarkArea: hasWatermark ? watermarkArea : null,
      }),
    onSuccess: () => {
      toast.success('Đã lưu');
      qc.invalidateQueries({ queryKey: ['mockups'] });
      qc.invalidateQueries({ queryKey: ['mockup', id] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const replaceMut = useMutation({
    mutationFn: (file: File) => replaceMockupFile(id!, file),
    onSuccess: () => {
      toast.success('Đã thay ảnh mockup');
      qc.invalidateQueries({ queryKey: ['mockups'] });
      qc.invalidateQueries({ queryKey: ['mockup', id] });
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!confirm(`Thay ảnh mockup bằng "${f.name}"? Vị trí design/watermark sẽ được giữ nguyên.`)) {
      e.target.value = '';
      return;
    }
    replaceMut.mutate(f);
  };

  if (isLoading || !mockup || !designArea) {
    return (
      <div className="flex justify-center py-16"><Spinner /></div>
    );
  }

  const avail = Math.max((canvasW || MAX_STAGE_WIDTH) - 32, 120);
  const scale = Math.min(
    avail / mockup.width,
    MAX_STAGE_HEIGHT / mockup.height,
    1,
  );
  const stageW = mockup.width * scale;
  const stageH = mockup.height * scale;

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => nav('/mockups')}>
            <ArrowLeft className="w-4 h-4" /> Quay lại
          </Button>
          <h1 className="text-xl font-bold">Sửa mockup</h1>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPickFile}
          />
          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={replaceMut.isPending}
          >
            {replaceMut.isPending ? <Spinner /> : <Upload className="w-4 h-4" />} Thay ảnh
          </Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? <Spinner /> : <Save className="w-4 h-4" />} Lưu vị trí
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <Card ref={canvasRef} className="p-4 flex justify-center items-center bg-slate-50 overflow-hidden">
          {image && (
            <Stage
              width={stageW}
              height={stageH}
              scaleX={scale}
              scaleY={scale}
              onMouseDown={(e) => {
                if (e.target === e.target.getStage()) setSelected(null);
              }}
            >
              <Layer>
                <KonvaImage image={image} width={mockup.width} height={mockup.height} listening={false} />
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
            <Label>Tên</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-sm text-brand-600">Design area</div>
              <div className="text-xs text-slate-500">Lock 5:7</div>
            </div>
            <AlignControls
              area={designArea}
              boundW={mockup.width}
              boundH={mockup.height}
              onChange={setDesignArea}
              className="mb-3"
            />
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
            <div>Kích thước mockup: <strong>{mockup.width}×{mockup.height}</strong> px</div>
          </Card>
        </div>
      </div>
    </div>
  );
}
