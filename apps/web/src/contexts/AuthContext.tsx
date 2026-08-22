import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getMe, login as apiLogin, logout as apiLogout } from '../api/auth';

interface AuthState {
  loading: boolean;
  username: string | null;
  role: string | null;
  isAdmin: boolean;
  authEnabled: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [authEnabled, setAuthEnabled] = useState(true);

  const refresh = async () => {
    try {
      const me = await getMe();
      setUsername(me.username);
      setRole(me.role ?? null);
      setAuthEnabled(me.authEnabled);
    } catch {
      setUsername(null);
      setRole(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const login = async (u: string, p: string) => {
    await apiLogin(u, p);
    await refresh();
  };

  const logout = async () => {
    await apiLogout();
    setUsername(null);
    setRole(null);
  };

  return (
    <AuthCtx.Provider
      value={{ loading, username, role, isAdmin: role === 'admin', authEnabled, login, logout, refresh }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
