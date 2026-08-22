import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRightLeft, Check } from 'lucide-react';
import {
  CONTENT_LABELS,
  getUserContent,
  listUsers,
  transferUserContent,
  type ContentType,
} from '../api/users';
import { Button, Label, Modal, Spinner } from './ui';
import { cn } from '../lib/cn';

const ORDER: ContentType[] = [
  'mockup',
  'shirtSet',
  'skinScene',
  'watermark',
  'idea',
  'generation',
];

interface Props {
  open: boolean;
  onClose: () => void;
  /** user đang bị chuyển dữ liệu đi */
  user: { id: string; username: string } | null;
}

/** Admin chuyển toàn bộ nội dung của 1 user sang user khác, chọn theo loại. */
export function TransferUserContentModal({ open, onClose, user }: Props) {
  const qc = useQueryClient();
  const [toUserId, setToUserId] = useState('');
  const [types, setTypes] = useState<Set<ContentType>>(new Set());

  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: listUsers, enabled: open });
  const { data: counts, isLoading } = useQuery({
    queryKey: ['user-content', user?.id],
    queryFn: () => getUserContent(user!.id),
    enabled: open && !!user,
  });

  // Mặc định tick sẵn những loại thực sự có dữ liệu.
  useEffect(() => {
    if (!open) return;
    setToUserId('');
    setTypes(new Set(counts ? ORDER.filter((t) => (counts[t] ?? 0) > 0) : []));
  }, [open, counts]);

  const total = useMemo(
    () => (counts ? [...types].reduce((n, t) => n + (counts[t] ?? 0), 0) : 0),
    [counts, types],
  );

  const mut = useMutation({
    mutationFn: () => transferUserContent(user!.id, { toUserId, types: [...types] }),
    onSuccess: (res) => {
      toast.success(
        `Đã chuyển ${res.total} mục từ "${res.from}" sang "${res.to}"` +
          (res.renamed ? ` (${res.renamed} bộ áo đổi tên do trùng)` : ''),
      );
      for (const k of ['mockups', 'shirt-sets', 'skin-scenes', 'watermarks', 'users']) {
        qc.invalidateQueries({ queryKey: [k] });
      }
      qc.invalidateQueries({ queryKey: ['user-content'] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || e.message),
  });

  function toggle(t: ContentType) {
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  return (
    <Modal
      open={open}
      onClose={() => !mut.isPending && onClose()}
      title={`Chuyển quyền sở hữu của "${user?.username ?? ''}"`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mut.isPending}>
            Huỷ
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={!toUserId || types.size === 0 || total === 0 || mut.isPending}
          >
            {mut.isPending ? <Spinner /> : <ArrowRightLeft className="w-4 h-4" />} Chuyển {total || ''}
          </Button>
        </>
      }
    >
      <div className="mb-4">
        <Label>Chuyển sang</Label>
        <select
          value={toUserId}
          onChange={(e) => setToUserId(e.target.value)}
          className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
        >
          <option value="">— chọn user —</option>
          {users
            .filter((u) => u.id !== user?.id)
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.username}
                {u.role === 'admin' ? ' (admin)' : ''}
              </option>
            ))}
        </select>
      </div>

      <Label>Loại dữ liệu</Label>
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-1">
          {ORDER.map((t) => {
            const n = counts?.[t] ?? 0;
            const on = types.has(t);
            return (
              <button
                key={t}
                type="button"
                disabled={n === 0 || mut.isPending}
                onClick={() => toggle(t)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 rounded-md border text-sm transition',
                  n === 0
                    ? 'border-slate-100 text-slate-300 cursor-not-allowed'
                    : on
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-slate-200 hover:bg-slate-50',
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex h-4 w-4 items-center justify-center rounded border',
                      on && n > 0 ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-300',
                    )}
                  >
                    {on && n > 0 && <Check className="w-3 h-3" />}
                  </span>
                  {CONTENT_LABELS[t]}
                </span>
                <span className="text-xs tabular-nums">{n}</span>
              </button>
            );
          })}
        </div>
      )}
      <p className="text-xs text-slate-500 mt-3">
        Chuyển xong user cũ không còn thấy các mục này. Ảnh không bị di chuyển trên đĩa nên xoá user
        cũ sau đó cũng không mất dữ liệu đã chuyển.
      </p>
    </Modal>
  );
}
