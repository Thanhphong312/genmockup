import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRightLeft, KeyRound, Plus, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { listUsers, createUser, updateUser, deleteUser } from '../api/users';
import { useAuth } from '../contexts/AuthContext';
import { Button, Card, EmptyState, Input, Label, Modal, Spinner } from '../components/ui';
import { TransferUserContentModal } from '../components/TransferUserContentModal';

export default function UsersPage() {
  const qc = useQueryClient();
  const { username: me } = useAuth();
  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: listUsers });

  const [open, setOpen] = useState(false);
  const [transferFor, setTransferFor] = useState<{ id: string; username: string } | null>(null);
  const [uName, setUName] = useState('');
  const [uPass, setUPass] = useState('');
  const [uRole, setURole] = useState('user');

  const createMut = useMutation({
    mutationFn: () => createUser({ username: uName, password: uPass, role: uRole }),
    onSuccess: () => {
      toast.success('Đã tạo user');
      qc.invalidateQueries({ queryKey: ['users'] });
      setOpen(false);
      setUName('');
      setUPass('');
      setURole('user');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || e.message),
  });

  const resetMut = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => updateUser(id, { password }),
    onSuccess: () => toast.success('Đã đổi mật khẩu'),
    onError: (e: any) => toast.error(e?.response?.data?.error || e.message),
  });

  const roleMut = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => updateUser(id, { role }),
    onSuccess: () => {
      toast.success('Đã đổi quyền');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      toast.success('Đã xoá user + dữ liệu');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || e.message),
  });

  return (
    <div className="p-4 sm:p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Người dùng</h1>
          <p className="text-sm text-slate-500 mt-1">Mỗi user có dữ liệu + OpenAI key riêng.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4" /> Thêm user
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : users.length === 0 ? (
        <EmptyState title="Chưa có user" hint="Bấm “Thêm user”." />
      ) : (
        <Card className="divide-y divide-slate-100">
          {users.map((u) => (
            <div key={u.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
              <div className="flex-1 min-w-0">
                <div className="font-medium flex items-center gap-2">
                  {u.username}
                  {u.role === 'admin' && (
                    <span className="inline-flex items-center gap-1 text-xs text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded">
                      <ShieldCheck className="w-3 h-3" /> admin
                    </span>
                  )}
                  {u.username === me && <span className="text-xs text-slate-400">(bạn)</span>}
                </div>
                <div className="text-xs text-slate-500">Tạo: {new Date(u.createdAt).toLocaleString()}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const p = prompt(`Mật khẩu mới cho "${u.username}":`);
                    if (p) resetMut.mutate({ id: u.id, password: p });
                  }}
                >
                  <KeyRound className="w-3.5 h-3.5" /> Đổi mật khẩu
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => roleMut.mutate({ id: u.id, role: u.role === 'admin' ? 'user' : 'admin' })}
                >
                  {u.role === 'admin' ? 'Hạ về user' : 'Nâng admin'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  title="Chuyển mockup / bộ áo / card skin… sang user khác"
                  onClick={() => setTransferFor({ id: u.id, username: u.username })}
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" /> Chuyển sở hữu
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={u.username === me}
                  onClick={() => {
                    if (confirm(`Xoá "${u.username}" và TOÀN BỘ dữ liệu của họ?`)) delMut.mutate(u.id);
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <TransferUserContentModal
        open={!!transferFor}
        user={transferFor}
        onClose={() => setTransferFor(null)}
      />

      <Modal
        open={open}
        onClose={() => !createMut.isPending && setOpen(false)}
        title="Thêm user mới"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={createMut.isPending}>Huỷ</Button>
            <Button onClick={() => createMut.mutate()} disabled={!uName || !uPass || createMut.isPending}>
              {createMut.isPending ? <Spinner /> : <UserPlus className="w-4 h-4" />} Tạo
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <Label>Username</Label>
            <Input value={uName} onChange={(e) => setUName(e.target.value)} placeholder="vd: designer1" />
          </div>
          <div>
            <Label>Mật khẩu</Label>
            <Input type="password" value={uPass} onChange={(e) => setUPass(e.target.value)} />
          </div>
          <div>
            <Label>Quyền</Label>
            <select
              value={uRole}
              onChange={(e) => setURole(e.target.value)}
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
