import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowRightLeft,
  Check,
  CheckCircle2,
  Crop,
  Share2,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  addSkinSceneShare,
  deleteSkinScene,
  listSkinSceneShares,
  listSkinScenes,
  removeSkinSceneShare,
  uploadSkinScene,
} from '../api/skinScenes';
import { Button, Card, EmptyState, Spinner } from '../components/ui';
import { ShareModal } from '../components/ShareModal';
import { BulkShareModal } from '../components/BulkShareModal';
import { AdminAllToggle } from '../components/AdminAllToggle';
import { TransferOwnerModal } from '../components/TransferOwnerModal';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/cn';
import { thumb } from '../lib/img';

export default function SkinScenesPage() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [shareFor, setShareFor] = useState<{ id: string; name: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [ownerIds, setOwnerIds] = useState<string[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const adminAll = isAdmin && showAll;
  const { data: scenes = [], isLoading } = useQuery({
    queryKey: ['skin-scenes', adminAll ? 'all' : 'mine'],
    queryFn: () => listSkinScenes(adminAll),
  });

  /**
   * Chọn được: mockup của mình (chia sẻ tiếp được), còn admin thì chọn được TẤT CẢ những gì
   * đang thấy — kể cả của user khác — vì admin có quyền đổi chủ / chia sẻ hộ (backend cũng cho).
   * Không phụ thuộc "xem tất cả": toggle đó chỉ quyết định danh sách hiện ra nhiều hay ít.
   */
  const selectableIds = useMemo(
    () => scenes.filter((s) => isAdmin || !s.shared).map((s) => s.id),
    [scenes, isAdmin],
  );

  // Bỏ khỏi selection những id đã biến mất (xoá xong, hoặc list đổi).
  useEffect(() => {
    setSelected((prev) => {
      const alive = new Set(selectableIds);
      const next = new Set([...prev].filter((id) => alive.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [selectableIds]);

  const allSelected = selectableIds.length > 0 && selected.size === selectableIds.length;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadSkinScene(file),
    onSuccess: (s) => {
      const bend = s.bend?.length ? ` · cong ${s.bend.map((b) => b.toFixed(0)).join('/')}px` : '';
      toast.success(`"${s.name}": đã dò vùng dán, tỉ lệ ${s.ratio}${bend}`);
      qc.invalidateQueries({ queryKey: ['skin-scenes'] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || e?.response?.data?.error || e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteSkinScene(id),
    onSuccess: () => {
      toast.success('Đã xoá');
      qc.invalidateQueries({ queryKey: ['skin-scenes'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  async function onPick(files: FileList | null) {
    if (!files?.length) return;
    setBusy(files.length);
    for (const f of Array.from(files)) {
      await uploadMut.mutateAsync(f).catch(() => {});
      setBusy((n) => n - 1);
    }
    setBusy(0);
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Mockup Card Skin</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Upload ảnh mockup đã <b>khoét rỗng mặt thẻ</b> (PNG có vùng trong suốt). Hệ thống tự
            xác định vùng dán; ngón tay, bo góc và chip giữ nguyên vì nằm sẵn trong ảnh.
          </p>
        </div>
        <div className="flex items-center gap-4">
          {isAdmin && <AdminAllToggle value={showAll} onChange={setShowAll} />}
          <input
            ref={fileRef}
            type="file"
            accept="image/png"
            multiple
            className="hidden"
            onChange={(e) => {
              onPick(e.target.files);
              e.target.value = '';
            }}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={busy > 0}>
            {busy > 0 ? <Spinner /> : <Upload className="w-4 h-4" />}
            {busy > 0 ? `Đang xử lý ${busy}…` : 'Upload mockup'}
          </Button>
        </div>
      </div>

      {selectableIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelected(allSelected ? new Set() : new Set(selectableIds))}
          >
            <span
              className={cn(
                'inline-flex h-4 w-4 items-center justify-center rounded border',
                allSelected ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-300',
              )}
            >
              {allSelected && <Check className="w-3 h-3" />}
            </span>
            {allSelected ? 'Bỏ chọn tất cả' : `Chọn tất cả (${selectableIds.length})`}
          </Button>
          <span className="text-sm text-slate-500">
            {selected.size > 0
              ? `Đã chọn ${selected.size}`
              : isAdmin
                ? 'Chọn mockup để chia sẻ / đổi chủ hàng loạt (admin chọn được cả của user khác)'
                : 'Chọn mockup để chia sẻ hàng loạt'}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {selected.size > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                <X className="w-3.5 h-3.5" /> Bỏ chọn
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="secondary"
                size="sm"
                disabled={selected.size === 0}
                onClick={() => setOwnerIds([...selected])}
              >
                <ArrowRightLeft className="w-3.5 h-3.5" /> Đổi chủ{' '}
                {selected.size > 0 ? selected.size : ''}
              </Button>
            )}
            <Button size="sm" disabled={selected.size === 0} onClick={() => setBulkOpen(true)}>
              <Share2 className="w-3.5 h-3.5" /> Chia sẻ {selected.size > 0 ? selected.size : ''}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : scenes.length === 0 ? (
        <EmptyState
          title="Chưa có mockup card skin nào"
          hint="Khoét rỗng mặt thẻ trong ảnh, xuất PNG rồi upload lên đây."
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {scenes.map((s) => (
            <Card
              key={s.id}
              className={cn(
                'overflow-hidden',
                selected.has(s.id) && 'ring-2 ring-brand-500 border-brand-500',
              )}
            >
              <div className="aspect-square bg-[repeating-conic-gradient(#e2e8f0_0_25%,#f8fafc_0_50%)] bg-[length:16px_16px] relative">
                <img
                  src={thumb(s.fileUrl, 400)}
                  alt={s.name}
                  loading="lazy"
                  className="w-full h-full object-contain"
                />
                {(isAdmin || !s.shared) && (
                  <button
                    type="button"
                    title="Chọn để chia sẻ / đổi chủ hàng loạt"
                    onClick={() => toggleSelect(s.id)}
                    className={cn(
                      'absolute top-2 left-2 inline-flex h-6 w-6 items-center justify-center rounded border shadow-sm transition',
                      selected.has(s.id)
                        ? 'bg-brand-600 border-brand-600 text-white'
                        : 'bg-white/90 border-slate-300 text-transparent hover:border-brand-400',
                    )}
                  >
                    <Check className="w-4 h-4" />
                  </button>
                )}
                {s.shared && (
                  <span
                    className={cn(
                      'absolute top-2 inline-flex items-center gap-1 text-[11px] bg-amber-500 text-white px-1.5 py-0.5 rounded',
                      isAdmin ? 'left-10' : 'left-2', // nhường chỗ cho ô tick
                    )}
                  >
                    <Users className="w-3 h-3" /> {s.ownerName || 'chia sẻ'}
                  </span>
                )}
                {s.calibrated && (
                  <span className="absolute top-2 right-2 inline-flex items-center gap-1 text-[11px] bg-emerald-600 text-white px-1.5 py-0.5 rounded">
                    <CheckCircle2 className="w-3 h-3" /> đã xác nhận
                  </span>
                )}
              </div>
              <div className="p-3">
                <div className="font-medium text-sm truncate" title={s.name}>{s.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {s.width}×{s.height} · tỉ lệ vùng {s.ratio}
                </div>
                {s.shared ? (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="flex-1 text-xs text-slate-400 italic truncate">
                      {adminAll
                        ? `Chủ: ${s.ownerName || '—'}`
                        : 'Được chia sẻ — chỉ dùng để generate'}
                    </span>
                    {isAdmin && (
                      <Button
                        variant="secondary"
                        size="sm"
                        title="Đổi chủ sở hữu"
                        onClick={() => setOwnerIds([s.id])}
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-2 mt-3">
                    <Link to={`/skin-scenes/${s.id}/edit`} className="flex-1">
                      <Button variant="secondary" size="sm" className="w-full">
                        <Crop className="w-3.5 h-3.5" /> Vùng dán
                      </Button>
                    </Link>
                    <Button
                      variant="secondary"
                      size="sm"
                      title="Chia sẻ"
                      onClick={() => setShareFor({ id: s.id, name: s.name })}
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </Button>
                    {isAdmin && (
                      <Button
                        variant="secondary"
                        size="sm"
                        title="Đổi chủ sở hữu"
                        onClick={() => setOwnerIds([s.id])}
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Xoá mockup "${s.name}"?`)) deleteMut.mutate(s.id);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <BulkShareModal
        open={bulkOpen}
        sceneIds={[...selected]}
        onClose={() => setBulkOpen(false)}
      />

      <TransferOwnerModal
        open={!!ownerIds}
        type="skinScene"
        ids={ownerIds ?? []}
        onClose={() => setOwnerIds(null)}
        onDone={() => setSelected(new Set())}
      />

      <ShareModal
        open={!!shareFor}
        resourceId={shareFor?.id ?? null}
        resourceName={shareFor?.name}
        onClose={() => setShareFor(null)}
        listKey="skin-scenes"
        listShares={listSkinSceneShares}
        addShare={addSkinSceneShare}
        removeShare={removeSkinSceneShare}
      />
    </div>
  );
}
