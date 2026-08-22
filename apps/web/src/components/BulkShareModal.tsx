import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Minus } from 'lucide-react';
import { getUserDirectory } from '../api/users';
import { bulkSkinSceneShare, skinSceneShareSummary } from '../api/skinScenes';
import { Button, Modal, Spinner } from './ui';
import { cn } from '../lib/cn';

interface Props {
  open: boolean;
  onClose: () => void;
  /** id các mockup đang được chọn */
  sceneIds: string[];
}

/**
 * Chia sẻ nhiều mockup card skin cho nhiều user trong 1 lần.
 * Khác ShareModal (1 tài nguyên, bấm là toggle ngay): ở đây chọn user trước rồi
 * bấm "Chia sẻ" / "Thu hồi" — vì với nhiều mockup, trạng thái có thể là "một phần"
 * nên toggle sẽ mơ hồ.
 */
export function BulkShareModal({ open, onClose, sceneIds }: Props) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const { data: directory = [], isLoading: dirLoading } = useQuery({
    queryKey: ['user-directory'],
    queryFn: getUserDirectory,
    enabled: open,
  });

  const summaryKey = useMemo(() => [...sceneIds].sort().join(','), [sceneIds]);
  const { data: summary, isLoading: sumLoading } = useQuery({
    queryKey: ['skin-scene-share-summary', summaryKey],
    queryFn: () => skinSceneShareSummary(sceneIds),
    enabled: open && sceneIds.length > 0,
  });

  useEffect(() => {
    if (open) setPicked(new Set());
  }, [open, summaryKey]);

  const countByUser = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of summary?.counts ?? []) m.set(c.userId, c.count);
    return m;
  }, [summary]);

  const total = summary?.total ?? sceneIds.length;

  const applyMut = useMutation({
    mutationFn: (mode: 'add' | 'remove') => bulkSkinSceneShare(sceneIds, [...picked], mode),
    onSuccess: (res, mode) => {
      toast.success(
        mode === 'add'
          ? `Đã chia sẻ ${res.scenes} mockup cho ${res.users} user (${res.changed} quyền mới)`
          : `Đã thu hồi ${res.changed} quyền trên ${res.scenes} mockup`,
      );
      qc.invalidateQueries({ queryKey: ['skin-scene-share-summary'] });
      qc.invalidateQueries({ queryKey: ['shares', 'skin-scenes'] });
      qc.invalidateQueries({ queryKey: ['skin-scenes'] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || e?.response?.data?.error || e.message),
  });

  const loading = dirLoading || sumLoading;
  const busy = applyMut.isPending;

  function toggle(userId: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Chia sẻ ${sceneIds.length} mockup đã chọn`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Đóng
          </Button>
          <Button
            variant="secondary"
            disabled={busy || picked.size === 0}
            onClick={() => applyMut.mutate('remove')}
          >
            Thu hồi
          </Button>
          <Button disabled={busy || picked.size === 0} onClick={() => applyMut.mutate('add')}>
            {busy ? <Spinner /> : null} Chia sẻ
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-500 mb-3">
        Chọn user rồi bấm <strong>Chia sẻ</strong> để cấp quyền dùng cho tất cả mockup đã chọn, hoặc{' '}
        <strong>Thu hồi</strong> để gỡ. User được chia sẻ chỉ <strong>dùng để generate</strong>,
        không sửa/xoá được.
      </p>
      {summary && summary.skipped > 0 && (
        <p className="text-xs text-amber-600 mb-3">
          {summary.skipped} mockup được người khác chia sẻ nên bỏ qua — chỉ chủ sở hữu mới chia sẻ
          tiếp được.
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : directory.length === 0 ? (
        <div className="text-sm text-slate-500 py-4">Chưa có user nào khác để chia sẻ.</div>
      ) : (
        <div className="space-y-1 max-h-72 overflow-auto">
          {directory.map((u) => {
            const on = picked.has(u.id);
            const n = countByUser.get(u.id) ?? 0;
            const state = n === 0 ? 'none' : n >= total ? 'all' : 'some';
            return (
              <button
                key={u.id}
                disabled={busy}
                onClick={() => toggle(u.id)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 rounded-md border text-sm transition',
                  on ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50',
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex h-4 w-4 items-center justify-center rounded border',
                      on ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-300',
                    )}
                  >
                    {on && <Check className="w-3 h-3" />}
                  </span>
                  {u.username}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded',
                    state === 'all'
                      ? 'bg-emerald-600 text-white'
                      : state === 'some'
                        ? 'bg-amber-100 text-amber-700'
                        : 'text-slate-400',
                  )}
                >
                  {state === 'all' ? (
                    <>
                      <Check className="w-3 h-3" /> Tất cả
                    </>
                  ) : state === 'some' ? (
                    <>
                      <Minus className="w-3 h-3" /> {n}/{total}
                    </>
                  ) : (
                    'Chưa'
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
