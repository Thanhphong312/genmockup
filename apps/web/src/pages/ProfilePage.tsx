import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Save, ShieldCheck } from 'lucide-react';
import { updateProfile } from '../api/auth';
import { useAuth } from '../contexts/AuthContext';
import { Button, Card, Input, Label, Spinner } from '../components/ui';

export default function ProfilePage() {
  const { username, role, refresh } = useAuth();
  const [name, setName] = useState(username || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const mut = useMutation({
    mutationFn: () =>
      updateProfile({
        username: name.trim() || undefined,
        currentPassword: newPassword ? currentPassword : undefined,
        newPassword: newPassword || undefined,
      }),
    onSuccess: async () => {
      toast.success('Đã cập nhật hồ sơ');
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
      await refresh();
    },
    onError: (e: any) => {
      const err = e?.response?.data?.error;
      const map: Record<string, string> = {
        username_taken: 'Username đã tồn tại',
        wrong_current_password: 'Mật khẩu hiện tại không đúng',
        password_too_short: 'Mật khẩu mới quá ngắn (≥ 4 ký tự)',
      };
      toast.error(map[err] || e?.response?.data?.message || e.message);
    },
  });

  const changingPw = !!newPassword;
  const canSave =
    !mut.isPending &&
    (name.trim() !== username || changingPw) &&
    (!changingPw || (currentPassword.length > 0 && newPassword === confirm));

  return (
    <div className="p-4 sm:p-8 max-w-xl">
      <h1 className="text-2xl font-bold mb-1">Hồ sơ</h1>
      <p className="text-sm text-slate-500 mb-6">Quản lý tài khoản của bạn.</p>

      <Card className="p-5 space-y-5">
        <div>
          <Label>Username</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Quyền:</span>
          {role === 'admin' ? (
            <span className="inline-flex items-center gap-1 text-brand-700 bg-brand-50 px-2 py-0.5 rounded text-xs">
              <ShieldCheck className="w-3.5 h-3.5" /> admin
            </span>
          ) : (
            <span className="text-slate-700">user</span>
          )}
        </div>

        <div className="border-t border-slate-100 pt-5 space-y-4">
          <div className="font-medium text-sm">Đổi mật khẩu</div>
          <div>
            <Label>Mật khẩu hiện tại</Label>
            <Input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Chỉ cần khi đổi mật khẩu"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Mật khẩu mới</Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div>
              <Label>Nhập lại mật khẩu mới</Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
          </div>
          {changingPw && newPassword !== confirm && (
            <p className="text-xs text-red-600">Mật khẩu nhập lại không khớp.</p>
          )}
        </div>

        <Button onClick={() => mut.mutate()} disabled={!canSave}>
          {mut.isPending ? <Spinner /> : <Save className="w-4 h-4" />} Lưu thay đổi
        </Button>
      </Card>
    </div>
  );
}
