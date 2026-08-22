import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Cloud, Download, Sparkles, Wand2, X } from 'lucide-react';
import type { Area, Generation } from '@genmockup/shared';
import { listMockups } from '../api/mockups';
import { listShirtSets } from '../api/shirtSets';
import { listWatermarks } from '../api/watermarks';
import { listIdeas } from '../api/ideas';
import { generate, generateShirt } from '../api/generate';
import { Button, Card, EmptyState, Input, Label, Spinner } from '../components/ui';
import { UploadToDriveModal } from '../components/UploadToDriveModal';
import { ShirtSetPositioner } from '../components/ShirtSetPositioner';
import { cn } from '../lib/cn';

type Mode = 'card' | 'shirt';

export default function GeneratePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>('card');
  const [designFile, setDesignFile] = useState<File | null>(null);
  const [designUrl, setDesignUrl] = useState('');
  const [designImageId, setDesignImageId] = useState<string | null>(null);
  const [selectedMockups, setSelectedMockups] = useState<Set<string>>(new Set());
  const [selectedSets, setSelectedSets] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(6);
  const [designAreas, setDesignAreas] = useState<Record<string, Area>>({});
  const [selectedColors, setSelectedColors] = useState<Record<string, Set<string>>>({});
  const [watermarkId, setWatermarkId] = useState('');
  const [result, setResult] = useState<Generation | null>(null);
  const [driveOpen, setDriveOpen] = useState(false);

  const { data: mockups = [] } = useQuery({ queryKey: ['mockups'], queryFn: () => listMockups() });
  const { data: sets = [] } = useQuery({ queryKey: ['shirt-sets'], queryFn: () => listShirtSets() });
  const { data: watermarks = [] } = useQuery({ queryKey: ['watermarks'], queryFn: () => listWatermarks() });
  const { data: ideas = [] } = useQuery({ queryKey: ['ideas'], queryFn: listIdeas });

  const ideaImage = useMemo(
    () => (designImageId ? ideas.find((i) => i.id === designImageId) ?? null : null),
    [designImageId, ideas],
  );

  // Nhận ảnh ý tưởng từ URL (?mode=shirt&ideaId=...)
  useEffect(() => {
    const ideaId = searchParams.get('ideaId');
    const m = searchParams.get('mode');
    if (ideaId) {
      setDesignImageId(ideaId);
      setDesignFile(null);
      setDesignUrl('');
      setMode(m === 'card' ? 'card' : 'shirt');
      setResult(null);
      searchParams.delete('ideaId');
      searchParams.delete('mode');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Preview URL của design (để hiển thị trong positioner)
  const designPreviewUrl = useMemo(() => {
    if (designImageId && ideaImage) return ideaImage.fileUrl;
    if (designFile) return URL.createObjectURL(designFile);
    return designUrl || null;
  }, [designFile, designUrl, designImageId, ideaImage]);
  useEffect(() => {
    return () => {
      if (designFile && designPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(designPreviewUrl);
    };
  }, [designPreviewUrl, designFile]);

  const clearIdea = () => setDesignImageId(null);

  const setById = useMemo(() => new Map(sets.map((s) => [s.id, s])), [sets]);

  // Khởi tạo designArea cho bộ mới được chọn từ vị trí đã lưu của bộ.
  useEffect(() => {
    setDesignAreas((prev) => {
      const next = { ...prev };
      for (const id of selectedSets) {
        if (!next[id]) {
          const s = setById.get(id);
          if (s) next[id] = { ...s.designArea };
        }
      }
      return next;
    });
  }, [selectedSets, setById]);

  // Bỏ chọn màu của các bộ không còn được chọn.
  useEffect(() => {
    setSelectedColors((prev) => {
      const next: Record<string, Set<string>> = {};
      for (const id of selectedSets) if (prev[id]) next[id] = prev[id];
      return next;
    });
  }, [selectedSets]);

  const uniqueColors = (s: (typeof sets)[number]) =>
    Array.from(new Set(s.variants.map((v) => v.color)));

  const toggleColor = (setId: string, color: string) =>
    setSelectedColors((prev) => {
      const cur = new Set(prev[setId] ?? []);
      if (cur.has(color)) cur.delete(color);
      else cur.add(color);
      return { ...prev, [setId]: cur };
    });

  const toggleAllColors = (setId: string, colors: string[]) =>
    setSelectedColors((prev) => {
      const cur = prev[setId] ?? new Set<string>();
      return { ...prev, [setId]: cur.size === colors.length ? new Set() : new Set(colors) };
    });

  const totalSelectedColors = Object.values(selectedColors).reduce((n, s) => n + s.size, 0);

  const mut = useMutation({
    mutationFn: () =>
      mode === 'card'
        ? generate({
            designFile: designFile || undefined,
            designUrl: designFile ? undefined : designUrl || undefined,
            mockupIds: Array.from(selectedMockups),
            watermarkId: watermarkId || undefined,
          })
        : generateShirt({
            designImageId: designImageId || undefined,
            designFile: designImageId ? undefined : designFile || undefined,
            designUrl: designImageId || designFile ? undefined : designUrl || undefined,
            setIds: Array.from(selectedSets),
            count,
            watermarkId: watermarkId || undefined,
            designAreas: Object.fromEntries(
              Array.from(selectedSets)
                .filter((id) => designAreas[id])
                .map((id) => [id, designAreas[id]]),
            ),
            colors: Object.fromEntries(
              Array.from(selectedSets)
                .map((id) => [id, Array.from(selectedColors[id] ?? [])] as const)
                .filter(([, list]) => list.length > 0),
            ),
          }),
    onSuccess: (g) => {
      setResult(g);
      toast.success(`Đã gen ${g.items.length} ảnh trong ${g.durationMs}ms`);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const toggle = (set: Set<string>, setFn: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFn(next);
  };

  const hasDesign = !!(designFile || designUrl || designImageId);
  const canGen =
    hasDesign &&
    !mut.isPending &&
    (mode === 'card' ? selectedMockups.size > 0 : selectedSets.size > 0);

  const switchMode = (m: Mode) => {
    setMode(m);
    setResult(null);
  };

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <h1 className="text-2xl font-bold mb-1">Generate Mockup</h1>
      <p className="text-sm text-slate-500 mb-6">Upload design → chọn mockup → gen.</p>

      <div className="inline-flex rounded-lg border border-slate-200 p-1 mb-6">
        {(['card', 'shirt'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className={cn(
              'px-4 py-1.5 rounded-md text-sm font-medium transition',
              mode === m ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            {m === 'card' ? 'Card / Ốp' : 'Áo (Shirt)'}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        <Card className="p-5">
          <h2 className="font-semibold mb-3">1. Design (5:7)</h2>
          {ideaImage ? (
            <div className="flex items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 p-3">
              <img
                src={ideaImage.fileUrl}
                alt=""
                className="w-14 h-14 rounded object-contain bg-white border border-slate-200"
              />
              <div className="flex-1 text-sm min-w-0">
                <div className="font-medium flex items-center gap-1 text-brand-700">
                  <Wand2 className="w-4 h-4" /> Đang dùng ảnh ý tưởng
                </div>
                {ideaImage.title ? (
                  <div className="text-xs text-slate-700 truncate" title={ideaImage.title}>🏷️ {ideaImage.title}</div>
                ) : (
                  <div className="text-xs text-slate-500 truncate">{ideaImage.ideaTitle || ideaImage.id}</div>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={clearIdea}>
                <X className="w-4 h-4" /> Gỡ
              </Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Upload file</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      setDesignFile(e.target.files?.[0] || null);
                      if (e.target.files?.[0]) setDesignUrl('');
                    }}
                    className="file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm"
                  />
                </div>
                <div>
                  <Label>… hoặc URL</Label>
                  <Input
                    placeholder="https://..."
                    value={designUrl}
                    onChange={(e) => {
                      setDesignUrl(e.target.value);
                      if (e.target.value) setDesignFile(null);
                    }}
                  />
                </div>
              </div>
              {designFile && (
                <div className="mt-3 text-xs text-slate-500">
                  File: <strong>{designFile.name}</strong> ({Math.round(designFile.size / 1024)} KB)
                </div>
              )}
            </>
          )}
        </Card>

        {mode === 'card' ? (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">2. Chọn mockup ({selectedMockups.size}/{mockups.length})</h2>
              {mockups.length > 0 && (
                <button
                  className="text-xs text-brand-600 hover:underline"
                  onClick={() =>
                    setSelectedMockups(
                      selectedMockups.size === mockups.length
                        ? new Set()
                        : new Set(mockups.map((m) => m.id)),
                    )
                  }
                >
                  {selectedMockups.size === mockups.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                </button>
              )}
            </div>
            {mockups.length === 0 ? (
              <EmptyState title="Chưa có mockup" hint="Vào tab Mockups upload ảnh trước." />
            ) : (
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {mockups.map((m) => {
                  const active = selectedMockups.has(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggle(selectedMockups, setSelectedMockups, m.id)}
                      className={cn(
                        'group rounded-lg border-2 overflow-hidden transition',
                        active ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-slate-200 hover:border-slate-300',
                      )}
                    >
                      <div className="aspect-[5/7] bg-slate-100 overflow-hidden">
                        <img src={m.fileUrl} alt={m.name} className="w-full h-full object-contain" />
                      </div>
                      <div className="p-2 text-xs truncate text-left">{m.name}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        ) : (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">2. Chọn bộ áo ({selectedSets.size}/{sets.length})</h2>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label className="!mb-0">Số lượng</Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={count}
                    onChange={(e) => setCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="h-8 w-20 text-sm"
                  />
                </div>
                {sets.length > 0 && (
                  <button
                    className="text-xs text-brand-600 hover:underline"
                    onClick={() =>
                      setSelectedSets(
                        selectedSets.size === sets.length ? new Set() : new Set(sets.map((s) => s.id)),
                      )
                    }
                  >
                    {selectedSets.size === sets.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                  </button>
                )}
              </div>
            </div>
            {sets.length === 0 ? (
              <EmptyState title="Chưa có bộ áo" hint="Vào tab “Bộ áo” bấm Scan/Import trước." />
            ) : (
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {sets.map((s) => {
                  const active = selectedSets.has(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggle(selectedSets, setSelectedSets, s.id)}
                      className={cn(
                        'group rounded-lg border-2 overflow-hidden transition',
                        active ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-slate-200 hover:border-slate-300',
                      )}
                    >
                      <div className="aspect-square bg-slate-100 overflow-hidden">
                        {s.representativeUrl && (
                          <img src={s.representativeUrl} alt={s.name} className="w-full h-full object-contain" />
                        )}
                      </div>
                      <div className="p-2 text-xs truncate text-left">
                        {s.name} · {s.variants.length} màu
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-3">
              Bỏ trống màu bên dưới → gộp tất cả màu của các bộ đã chọn, random {count} ảnh mỗi ảnh 1 màu khác nhau.
            </p>

            {selectedSets.size > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Chọn màu cụ thể (tuỳ chọn)</h3>
                  {totalSelectedColors > 0 && (
                    <button
                      className="text-xs text-brand-600 hover:underline"
                      onClick={() => setSelectedColors({})}
                    >
                      Xoá chọn màu (dùng random)
                    </button>
                  )}
                </div>

                {Array.from(selectedSets)
                  .map((id) => setById.get(id))
                  .filter((s): s is NonNullable<typeof s> => !!s)
                  .map((s) => {
                    const colors = uniqueColors(s);
                    const sel = selectedColors[s.id] ?? new Set<string>();
                    return (
                      <div key={s.id}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="text-xs font-medium text-slate-700">
                            {s.name} <span className="text-slate-400">· {colors.length} màu</span>
                          </div>
                          <button
                            className="text-[11px] text-brand-600 hover:underline"
                            onClick={() => toggleAllColors(s.id, colors)}
                          >
                            {sel.size === colors.length ? 'Bỏ chọn' : 'Chọn tất cả'}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {colors.map((c) => {
                            const active = sel.has(c);
                            return (
                              <button
                                key={c}
                                onClick={() => toggleColor(s.id, c)}
                                className={cn(
                                  'px-2.5 py-1 rounded-full border text-xs capitalize transition',
                                  active
                                    ? 'bg-brand-600 border-brand-600 text-white'
                                    : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400',
                                )}
                              >
                                {c}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                <p className="text-xs text-slate-500">
                  {totalSelectedColors > 0
                    ? `Sẽ gen đúng ${totalSelectedColors} màu đã chọn (bỏ qua random & Số lượng).`
                    : 'Chưa chọn màu nào → dùng random theo Số lượng ở trên.'}
                </p>
              </div>
            )}
          </Card>
        )}

        {mode === 'shirt' && selectedSets.size > 0 && (
          <Card className="p-5">
            <h2 className="font-semibold mb-1">3. Vị trí design cho từng bộ</h2>
            <p className="text-xs text-slate-500 mb-4">
              Kéo/scale khung xanh để đặt design cho mỗi bộ đã chọn. Khung bám sát design và giữ nguyên
              tỉ lệ ảnh gốc — bạn chỉnh chiều cao, chiều rộng tự tính theo. Áp dụng cho mọi màu random trong bộ đó.
            </p>
            {!designPreviewUrl ? (
              <EmptyState title="Chưa có design" hint="Upload design ở bước 1 để xem & chỉnh vị trí." />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from(selectedSets)
                  .map((id) => setById.get(id))
                  .filter((s): s is NonNullable<typeof s> => !!s)
                  .map((s) => (
                    <ShirtSetPositioner
                      key={s.id}
                      set={s}
                      designUrl={designPreviewUrl}
                      area={designAreas[s.id] ?? s.designArea}
                      onChange={(a) => setDesignAreas((prev) => ({ ...prev, [s.id]: a }))}
                      onReset={() =>
                        setDesignAreas((prev) => ({ ...prev, [s.id]: { ...s.designArea } }))
                      }
                    />
                  ))}
              </div>
            )}
          </Card>
        )}

        <Card className="p-5">
          <h2 className="font-semibold mb-3">
            {mode === 'shirt' ? '4' : '3'}. Watermark (optional)
          </h2>
          <select
            value={watermarkId}
            onChange={(e) => setWatermarkId(e.target.value)}
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
          >
            <option value="">— Không dùng watermark —</option>
            {watermarks.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </Card>

        <Button size="lg" disabled={!canGen} onClick={() => mut.mutate()} className="w-full">
          {mut.isPending ? <Spinner /> : <Sparkles className="w-5 h-5" />} Generate
        </Button>
      </div>

      {result && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-bold">Kết quả</h2>
            <Button variant="secondary" onClick={() => setDriveOpen(true)}>
              <Cloud className="w-4 h-4" /> Upload to Drive
            </Button>
          </div>
          <p className="text-sm text-slate-500 mb-2">
            {result.items.length} ảnh · {result.durationMs}ms · ID: <code>{result.id}</code>
          </p>
          {result.title && (
            <div className="flex items-start gap-2 mb-4 max-w-2xl">
              <div className="flex-1 rounded-md border border-slate-200 bg-slate-50 p-2 text-sm" title={result.title}>
                🏷️ {result.title}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(result.title || '').then(
                    () => toast.success('Đã copy title'),
                    () => toast.error('Không copy được'),
                  );
                }}
              >
                Copy
              </Button>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {result.items.map((it, idx) => (
              <Card key={it.variantId ?? it.mockupId ?? idx} className="overflow-hidden">
                <div className="aspect-square bg-slate-100 overflow-hidden">
                  <img src={it.outputUrl} alt="" className="w-full h-full object-contain" />
                </div>
                <div className="p-3">
                  {it.label && (
                    <div className="text-xs text-slate-500 mb-2 truncate" title={it.label}>{it.label}</div>
                  )}
                  <a href={it.outputUrl} download target="_blank" rel="noreferrer">
                    <Button variant="secondary" size="sm" className="w-full">
                      <Download className="w-3.5 h-3.5" /> Tải về
                    </Button>
                  </a>
                </div>
              </Card>
            ))}
          </div>

          <UploadToDriveModal
            open={driveOpen}
            onClose={() => setDriveOpen(false)}
            generationId={result.id}
            imageCount={result.items.length}
          />
        </div>
      )}
    </div>
  );
}
