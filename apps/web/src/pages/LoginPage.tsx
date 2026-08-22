import { useState, type FormEvent } from 'react';
import { LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { Button, Card, Input, Label, Spinner } from '../components/ui';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(username, password);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-xl font-bold text-brand-600 text-center mb-1">Gen Mockup</h1>
        <p className="text-sm text-slate-500 text-center mb-6">Đăng nhập để tiếp tục</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy ? <Spinner /> : <LogIn className="w-4 h-4" />}
            Đăng nhập
          </Button>
        </form>
      </Card>
    </div>
  );
}
