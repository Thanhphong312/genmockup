import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import { getUserDirectory } from '../api/users';
import { Button, Modal, Spinner } from './ui';
import { cn } from '../lib/cn';

interface Props {
  /** id tài nguyên đang chia sẻ; null = đóng */
  resourceId: string | null;
  resourceName?: string;
  open: boolean;
  onClose: () => void;
  /** query key của list tài nguyên để invalidate sau khi đổi (vd 'mockups' | 'shirt-sets') */
  listKey: string;
  listShares: (id: string) => Promise<{ id: string; username: string }[]>;
  addShare: (id: string, userId: string) => Promise<void>;
  removeShare: (id: string, userId: string) => Promise<void>;
}

export function ShareModal({
  resourceId,
  resourceName,
  open,
  onClose,
  listKey,
  listShares,
  addShare,
  removeShare,
}: Props) {
  const qc = useQueryClient();

  const { data: directory = [], isLoading: dirLoading } = useQuery({
    queryKey: ['user-directory'],
    queryFn: getUserDirectory,
    enabled: open,
  });
  const { data: shares = [], isLoading: sharesLoading } = useQuery({
    queryKey: ['shares', listKey, resourceId],
    queryFn: () => listShares(resourceId!),
    enabled: open && !!resourceId,
  });

  const sharedIds = useMemo(() => new Set(shares.map((s) => s.id)), [shares]);

  const toggleMut = useMutation({
    mutationFn: async ({ userId, on }: { userId: string; on: boolean }) => {
      if (on) await addShare(resourceId!, userId);
      else await removeShare(resourceId!, userId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shares', listKey, resourceId] });
      qc.invalidateQueries({ queryKey: [listKey] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || e.message),
  });

  const loading = dirLoading || sharesLoading;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Chia sẻ "${resourceName || ''}"`}
      footer={<Button onClick={onClose}>Xong</Button>}
    >
      <p className="text-sm text-slate-500 mb-3">
        User được chọn có thể <strong>dùng để generate</strong> (không sửa/xoá được).
      </p>
      {loading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : directory.length === 0 ? (
        <div className="text-sm text-slate-500 py-4">Chưa có user nào khác để chia sẻ.</div>
      ) : (
        <div className="space-y-1 max-h-72 overflow-auto">
          {directory.map((u) => {
            const on = sharedIds.has(u.id);
            return (
              <button
                key={u.id}
                disabled={toggleMut.isPending}
                onClick={() => toggleMut.mutate({ userId: u.id, on: !on })}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 rounded-md border text-sm transition',
                  on ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50',
                )}
              >
                <span>{u.username}</span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded',
                    on ? 'bg-brand-600 text-white' : 'text-slate-400',
                  )}
                >
                  {on ? (<><Check className="w-3 h-3" /> Đã chia sẻ</>) : 'Chưa'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
