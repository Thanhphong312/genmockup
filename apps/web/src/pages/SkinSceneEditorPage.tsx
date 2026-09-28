import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stage, Layer, Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';
import { toast } from 'sonner';
import { ArrowLeft, Eye, RefreshCw, Save } from 'lucide-react';
import type { Quad } from '@genmockup/shared';
import { CARD_SKIN_RATIO } from '@genmockup/shared';
import {
  getSkinScene,
  previewSkinScene,
  redetectSkinScene,
  updateSkinScene,
} from '../api/skinScenes';
import { Button, Card, Input, Label, Spinner } from '../components/ui';
import { QuadEditor, edgeBend } from '../components/QuadEditor';
import { useElementWidth } from '../lib/useElementWidth';
import { fileToDataUrl } from '../lib/img';
import { SCENE_KIND_UI } from '../lib/sceneKinds';

const MAX_STAGE_HEIGHT = 760;

export default function SkinSceneEditorPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();

  const { data: scene, isLoading } = useQuery({
    queryKey: ['skin-scene', id],
    queryFn: () => getSkinScene(id!),
    enabled: !!id,
  });

  const [name, setName] = useState('');
  const [corners, setCorners] = useState<Quad | null>(null);
  const [ctrl, setCtrl] = useState<Quad | null>(null);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [ratioNote, setRatioNote] = useState<string | null>(null);
  const designRef = useRef<HTMLInputElement>(null);
  const lastDesign = useRef<string | null>(null);
  const { ref: canvasRef, width: canvasW } = useElementWidth<HTMLDivElement>();

  useEffect(() => {
    if (!scene) return;
    setName(scene.name);
    setCorners(scene.corners);
    setCtrl(scene.ctrl);
    setDirty(false);
  }, [scene]);

  const [image] = useImage(scene?.fileUrl || '', 'anonymous');

  const saveMut = useMutation({
    mutationFn: () => updateSkinScene(id!, { name, corners: corners!, ctrl: ctrl! }),
    onSuccess: () => {
      toast.success('Đã lưu vùng dán');
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['skin-scenes'] });
      qc.invalidateQueries({ queryKey: ['skin-scene', id] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const redetectMut = useMutation({
    mutationFn: () => redetectSkinScene(id!),
    onSuccess: (s) => {
      setCorners(s.corners);
      setCtrl(s.ctrl);
      setDirty(false);
      toast.success('Đã dò lại từ vùng khoét');
      qc.invalidateQueries({ queryKey: ['skin-scene', id] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const previewMut = useMutation({
    mutationFn: async (imageBase64?: string) => {
      const b64 = imageBase64 ?? lastDesign.current;
      if (!b64) throw new Error('Chọn 1 file design để xem thử');
      lastDesign.current = b64;
      return previewSkinScene(id!, { imageBase64: b64, corners: corners!, ctrl: ctrl! });
    },
    onSuccess: (r) => {
      setPreview(r.dataUrl);
      const off = r.designRatio ? Math.abs(r.designRatio - r.holeRatio) / r.holeRatio : 0;
      setRatioNote(
        off > 0.12
          ? `Design tỉ lệ ${r.designRatio} nhưng vùng dán ${r.holeRatio} — lệch ${(off * 100).toFixed(0)}%, ảnh sẽ bị méo.`
          : null,
      );
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const bend = useMemo(
    () => (corners && ctrl ? edgeBend(corners, ctrl) : []),
    [corners, ctrl],
  );
  const ratio = useMemo(() => {
    if (!corners) return 0;
    const d = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const w = Math.max(d(corners[0], corners[1]), d(corners[3], corners[2]));
    const h = Math.max(d(corners[0], corners[3]), d(corners[1], corners[2]));
    return h ? w / h : 0;
  }, [corners]);

  if (isLoading || !scene || !corners || !ctrl) {
    return <div className="flex justify-center py-16"><Spinner /></div>;
  }

  const W = scene.width;
  const H = scene.height;
  const avail = Math.max((canvasW || 720) - 32, 160);
  const scale = Math.min(avail / W, MAX_STAGE_HEIGHT / H, 1);
  const ratioOff = Math.abs(ratio - CARD_SKIN_RATIO) / CARD_SKIN_RATIO;
  const ui = SCENE_KIND_UI[scene.kind ?? 'card'];

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => nav(ui.listPath)}>
            <ArrowLeft className="w-4 h-4" /> Quay lại
          </Button>
          <h1 className="text-xl font-bold">Xác định vùng dán · {ui.label}</h1>
          {dirty && <span className="text-xs text-amber-600">• chưa lưu</span>}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => redetectMut.mutate()} disabled={redetectMut.isPending}>
            {redetectMut.isPending ? <Spinner /> : <RefreshCw className="w-4 h-4" />} Dò lại tự động
          </Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? <Spinner /> : <Save className="w-4 h-4" />} Lưu vùng
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_330px] gap-6">
        <Card ref={canvasRef} className="p-4 flex justify-center items-center bg-slate-100 overflow-hidden">
          {image && (
            <Stage width={W * scale} height={H * scale} scaleX={scale} scaleY={scale}>
              <Layer>
                <KonvaImage image={image} width={W} height={H} listening={false} />
                <QuadEditor
                  corners={corners}
                  ctrl={ctrl}
                  handleScale={1 / scale}
                  onChange={(c, k) => {
                    setCorners(c);
                    setCtrl(k);
                    setDirty(true);
                  }}
                />
              </Layer>
            </Stage>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <Label>Tên mockup</Label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
              }}
            />
          </Card>

          <Card className="p-4 space-y-2 text-sm">
            <div className="font-semibold text-sm text-brand-600 mb-1">Vùng dán</div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tỉ lệ vùng</span>
              <span className={ratioOff > 0.15 ? 'text-amber-600 font-medium' : 'font-medium'}>
                {ratio.toFixed(3)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Chuẩn thẻ</span>
              <span className="text-slate-600">{CARD_SKIN_RATIO.toFixed(3)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Độ cong 4 cạnh</span>
              <span className="text-slate-600">{bend.map((b) => b.toFixed(0)).join(' / ')} px</span>
            </div>
            <p className="text-xs text-slate-500 pt-1 border-t border-slate-100 mt-2">
              {ui.editorHint} Kéo <b className="text-sky-600">● góc</b> để chỉnh 4 góc thẻ, kéo{' '}
              <b className="text-amber-600">◆ cam</b> để uốn cong cạnh. Lưới xanh là mặt phẳng
              design sẽ bám theo.
            </p>
            {ratioOff > 0.15 && (
              <p className="text-xs text-amber-600">
                Tỉ lệ lệch nhiều so với thẻ chuẩn — kiểm tra lại 4 góc có đúng mép thẻ không.
              </p>
            )}
          </Card>

          <Card className="p-4">
            <div className="font-semibold text-sm mb-2">Ghép thử</div>
            <input
              ref={designRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) previewMut.mutate(await fileToDataUrl(f));
                e.target.value = '';
              }}
            />
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => designRef.current?.click()}>
                Chọn design…
              </Button>
              <Button
                size="sm"
                onClick={() => previewMut.mutate(undefined)}
                disabled={previewMut.isPending || !lastDesign.current}
              >
                {previewMut.isPending ? <Spinner /> : <Eye className="w-4 h-4" />} Ghép lại
              </Button>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Ảnh ghép chạy bằng đúng code lúc generate — thấy sao ra vậy.
            </p>
            {ratioNote && <p className="text-xs text-amber-600 mt-2">{ratioNote}</p>}
            {preview && (
              <img src={preview} alt="preview" className="mt-3 w-full rounded border border-slate-200" />
            )}
          </Card>

          <Card className="p-4 text-xs text-slate-500">
            Ảnh gốc <strong>{W}×{H}</strong> px ·{' '}
            {scene.calibrated ? 'đã xác nhận thủ công' : 'đang dùng kết quả dò tự động'}
          </Card>
        </div>
      </div>
    </div>
  );
}
