import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Download, Image as ImageIcon, Sparkles, Upload } from 'lucide-react';
import { CARD_SKIN_RATIO, type SceneKind } from '@genmockup/shared';
import { listSkinScenes } from '../api/skinScenes';
import { listIdeas } from '../api/ideas';
import { generateSkin, type SkinGeneration } from '../api/generate';
import { Button, Card, EmptyState, Spinner } from '../components/ui';
import { thumb } from '../lib/img';
import { cn } from '../lib/cn';
import { SCENE_KIND_UI } from '../lib/sceneKinds';

type Source = 'file' | 'idea';

export default function SkinGeneratePage({ kind }: { kind: SceneKind }) {
  const ui = SCENE_KIND_UI[kind];
  const [source, setSource] = useState<Source>('file');
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [designRatio, setDesignRatio] = useState<number | null>(null);
  const [ideaId, setIdeaId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<SkinGeneration | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: scenes = [], isLoading } = useQuery({
    queryKey: ['skin-scenes', kind, 'mine'],
    queryFn: () => listSkinScenes(kind),
  });
  const { data: ideas = [] } = useQuery({
    queryKey: ['ideas'],
    queryFn: listIdeas,
    enabled: source === 'idea',
  });

  const genMut = useMutation({
    mutationFn: () =>
      generateSkin({
        kind,
        sceneIds: [...picked],
        designFile: source === 'file' ? file ?? undefined : undefined,
        designImageId: source === 'idea' ? ideaId ?? undefined : undefined,
      }),
    onSuccess: (g) => {
      setResult(g);
      toast.success(`Xong ${g.items.length} ảnh trong ${((g.durationMs ?? 0) / 1000).toFixed(1)}s`);
      if (g.ratioWarning) toast.warning(g.ratioWarning);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const ready = picked.size > 0 && (source === 'file' ? !!file : !!ideaId);

  /** Cảnh báo sớm ngay ở FE, không đợi generate xong mới biết ảnh méo. */
  const ratioWarn = useMemo(() => {
    if (!designRatio || !picked.size) return null;
    const bad = scenes
      .filter((s) => picked.has(s.id))
      .filter((s) => s.ratio && Math.abs(designRatio - s.ratio) / s.ratio > 0.12);
    if (!bad.length) return null;
    return `Design tỉ lệ ${designRatio.toFixed(3)} lệch nhiều so với vùng dán của ${bad
      .map((s) => `"${s.name}"`)
      .join(', ')} — ảnh sẽ bị méo.`;
  }, [designRatio, picked, scenes]);

  function pickFile(f: File) {
    setFile(f);
    const url = URL.createObjectURL(f);
    setFilePreview(url);
    const img = new Image();
    img.onload = () => setDesignRatio(img.width / img.height);
    img.src = url;
  }

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Generate {ui.label}</h1>
        <p className="text-sm text-slate-500 mt-1">
          Chọn 1 design rồi tick các mockup — mỗi mockup ra 1 ảnh, vị trí lấy từ vùng dán đã lưu.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex gap-2 mb-3">
              {(['file', 'idea'] as Source[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSource(s)}
                  className={cn(
                    'flex-1 h-9 rounded-md text-sm font-medium border transition-colors',
                    source === s
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50',
                  )}
                >
                  {s === 'file' ? 'Upload file' : 'Thư viện ý tưởng'}
                </button>
              ))}
            </div>

            {source === 'file' ? (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) pickFile(f);
                    e.target.value = '';
                  }}
                />
                <Button variant="secondary" className="w-full" onClick={() => fileRef.current?.click()}>
                  <Upload className="w-4 h-4" /> {file ? 'Đổi design…' : 'Chọn design…'}
                </Button>
                {filePreview && (
                  <div className="mt-3">
                    <img
                      src={filePreview}
                      alt="design"
                      className="w-full rounded border border-slate-200 bg-[repeating-conic-gradient(#e2e8f0_0_25%,#f8fafc_0_50%)] bg-[length:12px_12px]"
                    />
                    <div className="text-xs text-slate-500 mt-1.5 truncate" title={file?.name}>
                      {file?.name}
                      {designRatio && (
                        <> · tỉ lệ {designRatio.toFixed(3)} (chuẩn {CARD_SKIN_RATIO.toFixed(3)})</>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : ideas.length === 0 ? (
              <p className="text-sm text-slate-500">Thư viện ý tưởng đang trống.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 max-h-72 overflow-auto">
                {ideas.map((i) => (
                  <button
                    key={i.id}
                    onClick={() => {
                      setIdeaId(i.id);
                      setDesignRatio(i.width && i.height ? i.width / i.height : null);
                    }}
                    className={cn(
                      'aspect-square rounded border overflow-hidden',
                      ideaId === i.id ? 'ring-2 ring-brand-500 border-brand-500' : 'border-slate-200',
                    )}
                  >
                    <img src={thumb(i.fileUrl, 160)} alt="" className="w-full h-full object-contain" />
                  </button>
                ))}
              </div>
            )}
          </Card>

          {ratioWarn && (
            <Card className="p-3 border-amber-300 bg-amber-50">
              <div className="flex gap-2 text-xs text-amber-800">
                <AlertTriangle className="w-4 h-4 flex-none mt-0.5" />
                <span>{ratioWarn}</span>
              </div>
            </Card>
          )}

          <Button
            className="w-full"
            size="lg"
            disabled={!ready || genMut.isPending}
            onClick={() => genMut.mutate()}
          >
            {genMut.isPending ? <Spinner /> : <Sparkles className="w-4 h-4" />}
            Generate {picked.size > 0 && `(${picked.size} ảnh)`}
          </Button>
        </div>

        <div className="space-y-6">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-sm">Chọn mockup ({picked.size}/{scenes.length})</div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setPicked(new Set(scenes.map((s) => s.id)))}>
                  Chọn tất cả
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPicked(new Set())}>
                  Bỏ chọn
                </Button>
              </div>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : scenes.length === 0 ? (
              <EmptyState
                title={`Chưa có mockup ${ui.label}`}
                hint={`Vào trang Mockup ${ui.label} để upload ảnh đã khoét lỗ.`}
              />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {scenes.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => toggle(s.id)}
                    className={cn(
                      'rounded-lg border overflow-hidden text-left transition-colors',
                      picked.has(s.id) ? 'ring-2 ring-brand-500 border-brand-500' : 'border-slate-200 hover:border-slate-300',
                    )}
                  >
                    <div className="aspect-square bg-[repeating-conic-gradient(#e2e8f0_0_25%,#f8fafc_0_50%)] bg-[length:14px_14px]">
                      <img src={thumb(s.fileUrl, 300)} alt={s.name} loading="lazy" className="w-full h-full object-contain" />
                    </div>
                    <div className="px-2 py-1.5">
                      <div className="text-xs font-medium truncate" title={s.name}>{s.name}</div>
                      <div className="text-[11px] text-slate-500">
                        tỉ lệ {s.ratio}
                        {!s.calibrated && <span className="text-amber-600"> · chưa xác nhận</span>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {scenes.length > 0 && (
              <p className="text-xs text-slate-500 mt-3">
                Mockup <span className="text-amber-600">chưa xác nhận</span> đang dùng vùng dò tự
                động — mở <Link to={ui.listPath} className="text-brand-600 underline">Mockup {ui.label}</Link> để kiểm tra.
              </p>
            )}
          </Card>

          {result && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-sm">Kết quả ({result.items.length} ảnh)</div>
                <a
                  href={result.items[0]?.outputUrl}
                  download
                  className="text-xs text-brand-600 hover:underline inline-flex items-center gap-1"
                >
                  <ImageIcon className="w-3.5 h-3.5" /> mở ảnh đầu tiên
                </a>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {result.items.map((it) => (
                  <div key={it.outputPath} className="rounded-lg border border-slate-200 overflow-hidden group relative">
                    <img src={thumb(it.outputUrl, 400)} alt={it.label ?? ''} loading="lazy" className="w-full aspect-square object-contain bg-slate-50" />
                    <a
                      href={it.outputUrl}
                      download
                      className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-xs py-1.5 text-center opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" /> Tải về
                    </a>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
