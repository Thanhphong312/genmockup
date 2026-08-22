import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Download, Save, Shirt, Sparkles, Tag, Trash2, Wand2 } from 'lucide-react';
import type { IdeaGenerationResult, IdeaImage } from '@genmockup/shared';
import { getSettings } from '../api/settings';
import { startIdeas, getIdeaGeneration, saveIdeas, listIdeas, deleteIdea, type TrademarkMode } from '../api/ideas';
import { Button, Card, EmptyState, Input, Label, Spinner } from '../components/ui';
import { GenTitleModal } from '../components/GenTitleModal';
import { cn } from '../lib/cn';

const IDEA_COUNT = 4;

// Nền lưới caro để thấy vùng trong suốt của ảnh design
const CHECKER: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg,#e2e8f0 25%,transparent 25%),linear-gradient(-45deg,#e2e8f0 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e2e8f0 75%),linear-gradient(-45deg,transparent 75%,#e2e8f0 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
};

export default function NewIdeaPage() {
  const qc = useQueryClient();
  const nav = useNavigate();

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const { data: library = [] } = useQuery({ queryKey: ['ideas'], queryFn: listIdeas });

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [keyword, setKeyword] = useState('');
  const [trademark, setTrademark] = useState<TrademarkMode>('avoid');
  const [titleFor, setTitleFor] = useState<IdeaImage | null>(null);
  const [genId, setGenId] = useState<string | null>(null);
  const [result, setResult] = useState<IdeaGenerationResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Preview ảnh upload
  const filePreview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (filePreview) URL.revokeObjectURL(filePreview);
    };
  }, [filePreview]);

  // Poll trạng thái generation đang chạy nền
  const { data: progress } = useQuery({
    queryKey: ['idea-gen', genId],
    queryFn: () => getIdeaGeneration(genId!),
    enabled: !!genId,
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 2500 : false),
  });

  useEffect(() => {
    if (!progress) return;
    if (progress.status === 'done') {
      setResult(progress);
      setGenId(null);
      toast.success(`Đã tạo ${progress.images.length} ý tưởng`);
    } else if (progress.status === 'error') {
      setGenId(null);
      toast.error(progress.error || 'Tạo ý tưởng thất bại');
    }
  }, [progress]);

  const genMut = useMutation({
    mutationFn: () => startIdeas(file!, title, keyword, IDEA_COUNT, trademark),
    onSuccess: (r) => {
      setResult(null);
      setSelected(new Set());
      setGenId(r.id);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const isGenerating = genMut.isPending || !!genId;

  const saveMut = useMutation({
    mutationFn: () => saveIdeas(Array.from(selected)),
    onSuccess: (saved) => {
      toast.success(`Đã lưu ${saved.length} ảnh`);
      setResult(null);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['ideas'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteIdea(id),
    onSuccess: () => {
      toast.success('Đã xoá');
      qc.invalidateQueries({ queryKey: ['ideas'] });
    },
  });

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  // Tải ảnh về máy (qua blob để hoạt động cả khi ảnh khác origin).
  const downloadImage = async (img: IdeaImage) => {
    const safe = (img.title || img.ideaTitle || img.id)
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .trim()
      .slice(0, 80);
    try {
      const res = await fetch(img.fileUrl);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safe || 'idea'}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error('Không tải được ảnh');
    }
  };

  const ideasEnabled = settings?.ideasEnabled !== false;
  const canGen = !!file && (title.trim() || keyword.trim()) && !isGenerating && ideasEnabled;

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <h1 className="text-2xl font-bold mb-1">New Idea (AI)</h1>
      <p className="text-sm text-slate-500 mb-6">
        Phân tích ảnh + title + keyword → tạo ý tưởng tương tự → lưu & apply lên áo.
      </p>

      {!ideasEnabled && (
        <Card className="p-4 mb-6 border-amber-300 bg-amber-50">
          <div className="text-sm text-amber-800">
            🔒 Tính năng <strong>phân tích &amp; tạo ý tưởng</strong> đang tạm khóa. Thư viện ý tưởng đã lưu vẫn dùng bình thường.
          </div>
        </Card>
      )}

      {ideasEnabled && settings && !settings.hasOpenaiKey && (
        <Card className="p-4 mb-6 border-amber-300 bg-amber-50">
          <div className="text-sm text-amber-800">
            Chưa có OpenAI API key.{' '}
            <Link to="/settings" className="font-medium underline">Vào Cài đặt</Link> để nhập trước.
          </div>
        </Card>
      )}

      <div className="space-y-6">
        <Card className="p-5">
          <h2 className="font-semibold mb-3">1. Nguồn</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Ảnh gốc</Label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm"
              />
              {filePreview && (
                <div className="mt-3">
                  <div
                    className="aspect-square w-40 rounded-lg border border-slate-200 overflow-hidden"
                    style={CHECKER}
                  >
                    <img src={filePreview} alt="preview" className="w-full h-full object-contain" />
                  </div>
                  <div className="mt-1 text-xs text-slate-500 truncate" title={file?.name}>
                    {file?.name} ({Math.round((file?.size || 0) / 1024)} KB)
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-3">
              <div>
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="vd: Retro sunset cat" />
              </div>
              <div>
                <Label>Keyword</Label>
                <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="vd: vintage, 80s, funny" />
              </div>
              <div>
                <Label>Trademark / thương hiệu</Label>
                <select
                  value={trademark}
                  onChange={(e) => setTrademark(e.target.value as TrademarkMode)}
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                >
                  <option value="avoid">Hạn chế — tránh logo/nhãn hiệu (an toàn POD)</option>
                  <option value="keep">Lấy luôn — giữ thương hiệu từ ảnh gốc</option>
                  <option value="default">Mặc định — không can thiệp</option>
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  {trademark === 'avoid'
                    ? 'AI sẽ thay logo/nhãn hiệu bằng yếu tố gốc, an toàn để in bán.'
                    : trademark === 'keep'
                    ? 'AI cố giữ logo/thương hiệu (OpenAI có thể từ chối nếu vi phạm chính sách).'
                    : 'Không thêm chỉ dẫn về trademark.'}
                </p>
              </div>
            </div>
          </div>
          <Button className="mt-4" size="lg" disabled={!canGen} onClick={() => genMut.mutate()}>
            {isGenerating ? <Spinner /> : <Wand2 className="w-5 h-5" />} Phân tích &amp; tạo {IDEA_COUNT} ý tưởng
          </Button>
          {isGenerating && (
            <p className="text-xs text-slate-500 mt-2">
              Đang tạo (chạy nền)… {progress ? `đã xong ${progress.images.length}/${IDEA_COUNT} ảnh` : 'đang phân tích'}
            </p>
          )}
        </Card>

        {result && (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">2. Kết quả ({selected.size} đã chọn)</h2>
              <Button
                disabled={selected.size === 0 || saveMut.isPending}
                onClick={() => saveMut.mutate()}
              >
                {saveMut.isPending ? <Spinner /> : <Save className="w-4 h-4" />} Lưu ảnh đã chọn
              </Button>
            </div>

            {result.analysis && (
              <details className="mb-4 text-sm">
                <summary className="cursor-pointer font-medium text-slate-700 flex items-center gap-1">
                  <Sparkles className="w-4 h-4 text-brand-500" /> Phân tích chuyên sâu
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-slate-600">{result.analysis}</p>
              </details>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {result.images.map((img) => {
                const active = selected.has(img.id);
                return (
                  <button
                    key={img.id}
                    onClick={() => toggle(img.id)}
                    className={cn(
                      'group rounded-lg border-2 overflow-hidden transition text-left relative',
                      active ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-slate-200 hover:border-slate-300',
                    )}
                  >
                    {active && (
                      <div className="absolute top-2 right-2 z-10 bg-brand-600 text-white rounded-full p-1">
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    )}
                    <div className="aspect-square overflow-hidden" style={CHECKER}>
                      <img src={img.fileUrl} alt={img.ideaTitle || ''} className="w-full h-full object-contain" />
                    </div>
                    <div className="p-2">
                      {img.ideaTitle && (
                        <div className="text-xs font-medium truncate" title={img.ideaTitle}>{img.ideaTitle}</div>
                      )}
                      {img.sellingPoints && (
                        <div className="text-[11px] text-emerald-700 mt-1 line-clamp-3" title={img.sellingPoints}>
                          💰 {img.sellingPoints}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        )}

        <Card className="p-5">
          <h2 className="font-semibold mb-3">Thư viện ý tưởng ({library.length})</h2>
          {library.length === 0 ? (
            <EmptyState title="Chưa có ảnh ý tưởng đã lưu" hint="Tạo & lưu ý tưởng ở trên." />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {library.map((img) => (
                <Card key={img.id} className="overflow-hidden">
                  <div className="aspect-square overflow-hidden relative" style={CHECKER}>
                    <img src={img.fileUrl} alt={img.ideaTitle || ''} className="w-full h-full object-contain" />
                    <span
                      className={cn(
                        'absolute top-2 right-2 text-[11px] px-1.5 py-0.5 rounded font-medium',
                        img.usedCount > 0 ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500',
                      )}
                      title="Số lần đã gen mockup từ idea này"
                    >
                      đã gen {img.usedCount}
                    </span>
                  </div>
                  <div className="p-2 space-y-2">
                    {img.ideaTitle && (
                      <div className="text-xs font-medium truncate" title={img.ideaTitle}>{img.ideaTitle}</div>
                    )}
                    {img.sellingPoints && (
                      <div className="text-[11px] text-emerald-700 line-clamp-3" title={img.sellingPoints}>
                        💰 {img.sellingPoints}
                      </div>
                    )}
                    {img.title && (
                      <div
                        className="text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded p-1 line-clamp-2"
                        title={img.title}
                      >
                        🏷️ {img.title}
                      </div>
                    )}
                    <div className="flex gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1 whitespace-nowrap"
                        onClick={() => setTitleFor(img)}
                      >
                        <Tag className="w-3.5 h-3.5" /> {img.title ? 'Sửa title' : 'Gen title'}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        title="Tải ảnh về"
                        onClick={() => downloadImage(img)}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        className="flex-1 whitespace-nowrap"
                        onClick={() => nav(`/generate?mode=shirt&ideaId=${img.id}`)}
                      >
                        <Shirt className="w-3.5 h-3.5" /> Apply áo
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          if (confirm('Xoá ảnh ý tưởng này?')) delMut.mutate(img.id);
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Card>
      </div>

      <GenTitleModal idea={titleFor} open={!!titleFor} onClose={() => setTitleFor(null)} />
    </div>
  );
}
