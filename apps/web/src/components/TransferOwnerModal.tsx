import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRightLeft } from 'lucide-react';
import { listUsers, transferItems, type ContentType } from '../api/users';
import { Button, Label, Modal, Spinner } from './ui';

/** query key của list tương ứng, để refresh sau khi đổi chủ */
const LIST_KEY: Record<string, string> = {
  mockup: 'mockups',
  shirtSet: 'shirt-sets',
  skinScene: 'skin-scenes',
  watermark: 'watermarks',
};

interface Props {
  open: boolean;
  onClose: () => void;
  type: ContentType;
  /** id các item sẽ đổi chủ */
  ids: string[];
  /** mô tả ngắn hiện trong modal, vd tên item khi chỉ đổi 1 cái */
  subject?: string;
  /** gọi sau khi đổi xong (vd bỏ chọn) */
  onDone?: () => void;
}

/** Admin chuyển quyền sở hữu một/nhiều item sang user khác. */
export function TransferOwnerModal({ open, onClose, type, ids, subject, onDone }: Props) {
  const qc = useQueryClient();
  const [toUserId, setToUserId] = useState('');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: listUsers,
    enabled: open,
  });

  useEffect(() => {
    if (open) setToUserId('');
  }, [open]);

  const mut = useMutation({
    mutationFn: () => transferItems({ type, ids, toUserId }),
    onSuccess: (res) => {
      toast.success(
        `Đã chuyển ${res.moved} mục sang "${res.toUsername}"` +
          (res.renamed ? ` (${res.renamed} bộ đổi tên do trùng)` : ''),
      );
      qc.invalidateQueries({ queryKey: [LIST_KEY[type] ?? 'mockups'] });
      qc.invalidateQueries({ queryKey: ['users'] });
      onDone?.();
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || e.message),
  });

  return (
    <Modal
      open={open}
      onClose={() => !mut.isPending && onClose()}
      title={`Đổi chủ sở hữu ${ids.length > 1 ? `${ids.length} mục` : ''}`.trim()}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mut.isPending}>
            Huỷ
          </Button>
          <Button onClick={() => mut.mutate()} disabled={!toUserId || mut.isPending || !ids.length}>
            {mut.isPending ? <Spinner /> : <ArrowRightLeft className="w-4 h-4" />} Chuyển
          </Button>
        </>
      }
    >
      {subject && <p className="text-sm text-slate-600 mb-3 truncate">{subject}</p>}
      <p className="text-sm text-slate-500 mb-4">
        Chủ mới toàn quyền sửa/xoá/chia sẻ. Ảnh giữ nguyên chỗ cũ trên đĩa nên không mất gì; các
        quyền chia sẻ đã cấp vẫn còn.
      </p>
      <div>
        <Label>Chuyển sang</Label>
        {isLoading ? (
          <div className="py-3">
            <Spinner />
          </div>
        ) : (
          <select
            value={toUserId}
            onChange={(e) => setToUserId(e.target.value)}
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
          >
            <option value="">— chọn user —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username}
                {u.role === 'admin' ? ' (admin)' : ''}
              </option>
            ))}
          </select>
        )}
      </div>
    </Modal>
  );
}
