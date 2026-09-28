import { useState } from 'react';
import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import { Image, Shirt, CreditCard, IdCard, Droplet, Sparkles, Wand2, Settings, Users, User, BookOpen, LogOut, Menu, X } from 'lucide-react';
import MockupsPage from './pages/MockupsPage';
import MockupEditorPage from './pages/MockupEditorPage';
import ShirtSetsPage from './pages/ShirtSetsPage';
import ShirtSetEditorPage from './pages/ShirtSetEditorPage';
import SkinScenesPage from './pages/SkinScenesPage';
import SkinSceneEditorPage from './pages/SkinSceneEditorPage';
import SkinGeneratePage from './pages/SkinGeneratePage';
import GeneratePage from './pages/GeneratePage';
import NewIdeaPage from './pages/NewIdeaPage';
import SettingsPage from './pages/SettingsPage';
import ProfilePage from './pages/ProfilePage';
import DocsPage from './pages/DocsPage';
import UsersPage from './pages/UsersPage';
import WatermarksPage from './pages/WatermarksPage';
import LoginPage from './pages/LoginPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Spinner } from './components/ui';
import { cn } from './lib/cn';

function NavItem({
  to,
  icon,
  label,
  onNavigate,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors',
          isActive ? 'bg-brand-50 text-brand-700 font-medium' : 'text-slate-700 hover:bg-slate-100',
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}

function Shell() {
  const { username, authEnabled, isAdmin, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => setMenuOpen(false);

  return (
    <div className="min-h-screen lg:flex">
      {/* Thanh trên cùng (mobile) */}
      <div className="lg:hidden sticky top-0 z-30 flex items-center gap-3 h-14 px-4 bg-white border-b border-slate-200">
        <button onClick={() => setMenuOpen(true)} className="p-1.5 -ml-1.5 rounded hover:bg-slate-100" aria-label="Menu">
          <Menu className="w-5 h-5" />
        </button>
        <h2 className="text-base font-bold text-brand-600">Gen Mockup</h2>
      </div>

      {/* Backdrop khi mở drawer */}
      {menuOpen && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={close} />}

      <aside
        className={cn(
          'bg-white border-r border-slate-200 p-4 flex flex-col',
          'fixed inset-y-0 left-0 z-50 w-64 transition-transform duration-200',
          'lg:static lg:z-auto lg:w-56 lg:translate-x-0',
          menuOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between mb-6 px-3">
          <h2 className="text-lg font-bold text-brand-600">Gen Mockup</h2>
          <button onClick={close} className="lg:hidden p-1 rounded hover:bg-slate-100" aria-label="Đóng">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex flex-col gap-1 flex-1">
          <NavItem to="/mockups" icon={<Image className="w-4 h-4" />} label="Mockups" onNavigate={close} />
          <NavItem to="/shirt-sets" icon={<Shirt className="w-4 h-4" />} label="Bộ áo" onNavigate={close} />
          <NavItem to="/skin-scenes" icon={<CreditCard className="w-4 h-4" />} label="Mockup Card Skin" onNavigate={close} />
          <NavItem to="/skin-generate" icon={<CreditCard className="w-4 h-4" />} label="Gen Card Skin" onNavigate={close} />
          <NavItem to="/pass-scenes" icon={<IdCard className="w-4 h-4" />} label="Mockup Pass Sleeve" onNavigate={close} />
          <NavItem to="/pass-generate" icon={<IdCard className="w-4 h-4" />} label="Gen Pass Sleeve" onNavigate={close} />
          <NavItem to="/ideas" icon={<Wand2 className="w-4 h-4" />} label="New Idea" onNavigate={close} />
          <NavItem to="/watermarks" icon={<Droplet className="w-4 h-4" />} label="Watermarks" onNavigate={close} />
          <NavItem to="/generate" icon={<Sparkles className="w-4 h-4" />} label="Generate" onNavigate={close} />
          {isAdmin && <NavItem to="/users" icon={<Users className="w-4 h-4" />} label="Người dùng" onNavigate={close} />}
          <NavItem to="/profile" icon={<User className="w-4 h-4" />} label="Hồ sơ" onNavigate={close} />
          <NavItem to="/docs" icon={<BookOpen className="w-4 h-4" />} label="Hướng dẫn" onNavigate={close} />
          <NavItem to="/settings" icon={<Settings className="w-4 h-4" />} label="Cài đặt" onNavigate={close} />
        </nav>
        {authEnabled && username && (
          <div className="border-t border-slate-200 pt-3 mt-3">
            <div className="px-3 text-xs text-slate-500 mb-2 truncate" title={username}>
              {username}
            </div>
            <button
              onClick={() => logout()}
              className="w-full flex items-center gap-2 px-3 py-2 rounded text-sm text-slate-600 hover:bg-slate-100"
            >
              <LogOut className="w-4 h-4" /> Đăng xuất
            </button>
          </div>
        )}
      </aside>

      <main className="flex-1 min-w-0 overflow-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/mockups" replace />} />
          <Route path="/mockups" element={<MockupsPage />} />
          <Route path="/mockups/:id/edit" element={<MockupEditorPage />} />
          <Route path="/shirt-sets" element={<ShirtSetsPage />} />
          <Route path="/shirt-sets/:id/edit" element={<ShirtSetEditorPage />} />
          <Route path="/skin-scenes" element={<SkinScenesPage key="card" kind="card" />} />
          <Route path="/skin-scenes/:id/edit" element={<SkinSceneEditorPage />} />
          <Route path="/skin-generate" element={<SkinGeneratePage key="card" kind="card" />} />
          <Route path="/pass-scenes" element={<SkinScenesPage key="pass" kind="pass" />} />
          <Route path="/pass-scenes/:id/edit" element={<SkinSceneEditorPage />} />
          <Route path="/pass-generate" element={<SkinGeneratePage key="pass" kind="pass" />} />
          <Route path="/ideas" element={<NewIdeaPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          {isAdmin && <Route path="/users" element={<UsersPage />} />}
          <Route path="/watermarks" element={<WatermarksPage />} />
          <Route path="/generate" element={<GeneratePage />} />
        </Routes>
      </main>
    </div>
  );
}

function Gate() {
  const { loading, authEnabled, username } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (authEnabled && !username) {
    return <LoginPage />;
  }
  return <Shell />;
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
