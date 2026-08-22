import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Cloud,
  FolderPlus,
  ExternalLink,
  Check,
  X,
  LogIn,
  LogOut,
  Folder,
  ChevronRight,
  Home,
  ArrowLeft,
} from 'lucide-react';
import {
  createDriveFolder,
  disconnectDrive,
  getDriveStatus,
  getOAuthStartUrl,
  listDriveFolders,
  uploadGenerationToDrive,
  type DriveUploadResult,
} from '../api/drive';
import { Button, Input, Label, Modal, Spinner } from './ui';
import { cn } from '../lib/cn';

interface Props {
  open: boolean;
  onClose: () => void;
  generationId: string;
  imageCount: number;
}

type PathNode = { id: string; name: string };

export function UploadToDriveModal({ open, onClose, generationId, imageCount }: Props) {
  const qc = useQueryClient();
  const [path, setPath] = useState<PathNode[]>([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [result, setResult] = useState<DriveUploadResult | null>(null);

  const status = useQuery({
    queryKey: ['drive-status'],
    queryFn: getDriveStatus,
    enabled: open,
    refetchInterval: open && !document.hidden ? 3000 : false,
  });

  // Khởi tạo root path khi authenticated
  useEffect(() => {
    if (status.data?.authenticated && path.length === 0) {
      setPath([
        {
          id: status.data.parentFolderId || 'root',
          name: status.data.parentFolderId ? 'Root folder' : 'My Drive',
        },
      ]);
    }
  }, [status.data, path.length]);

  const currentFolder = path[path.length - 1];
  const currentFolderId = currentFolder?.id;

  const folders = useQuery({
    queryKey: ['drive-folders', currentFolderId],
    queryFn: () => listDriveFolders(currentFolderId),
    enabled: open && status.data?.authenticated === true && !!currentFolderId,
  });

  const createMut = useMutation({
    mutationFn: () => createDriveFolder(newFolderName, currentFolderId),
    onSuccess: (f) => {
      toast.success(`Đã tạo folder "${f.name}"`);
      setNewFolderName('');
      qc.invalidateQueries({ queryKey: ['drive-folders', currentFolderId] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const uploadMut = useMutation({
    mutationFn: () => uploadGenerationToDrive(generationId, currentFolderId!),
    onSuccess: (r) => {
      setResult(r);
      const ok = r.uploaded.filter((u) => !u.error).length;
      const fail = r.uploaded.length - ok;
      if (fail === 0) toast.success(`Đã upload ${ok} ảnh lên "${currentFolder.name}"`);
      else toast.warning(`${ok} thành công, ${fail} lỗi`);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const disconnectMut = useMutation({
    mutationFn: disconnectDrive,
    onSuccess: () => {
      toast.success('Đã ngắt kết nối Drive');
      setPath([]);
      qc.invalidateQueries({ queryKey: ['drive-status'] });
    },
  });

  const handleClose = () => {
    if (uploadMut.isPending || createMut.isPending) return;
    setNewFolderName('');
    setResult(null);
    setPath([]);
    onClose();
  };

  const handleConnect = () => {
    const back = window.location.href;
    window.location.href = getOAuthStartUrl(back);
  };

  const enterFolder = (f: { id: string; name: string }) => {
    setPath([...path, { id: f.id, name: f.name }]);
  };

  const jumpTo = (i: number) => {
    setPath(path.slice(0, i + 1));
  };

  const goBack = () => {
    if (path.length > 1) setPath(path.slice(0, -1));
  };

  const s = status.data;
  const notConfigured = s && !s.configured;
  const notAuthed = s && s.configured && !s.authenticated;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Upload to Google Drive"
      footer={
        result ? (
          <Button onClick={handleClose}>Đóng</Button>
        ) : notConfigured ? (
          <Button onClick={handleClose}>Đóng</Button>
        ) : notAuthed ? (
          <Button onClick={handleConnect}>
            <LogIn className="w-4 h-4" /> Kết nối Google Drive
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={handleClose} disabled={uploadMut.isPending}>
              Huỷ
            </Button>
            <Button
              onClick={() => uploadMut.mutate()}
              disabled={!currentFolderId || uploadMut.isPending}
            >
              {uploadMut.isPending ? <Spinner /> : <Cloud className="w-4 h-4" />}
              Upload {imageCount} ảnh vào đây
            </Button>
          </>
        )
      }
    >
      {status.isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : notConfigured ? (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
          OAuth chưa được cấu hình. Set <code>GOOGLE_OAUTH_CLIENT_ID</code> và{' '}
          <code>GOOGLE_OAUTH_CLIENT_SECRET</code> trong <code>.env</code>.
        </div>
      ) : notAuthed ? (
        <div className="text-sm text-slate-600 space-y-3">
          <p>Chưa kết nối với tài khoản Google. Click bên dưới để login.</p>
          <div className="text-xs text-slate-500 border border-slate-200 rounded p-3 bg-slate-50">
            App sẽ xin quyền: <strong>truy cập Drive</strong> để liệt kê folder, tạo folder mới,
            và upload ảnh.
          </div>
        </div>
      ) : result ? (
        <div className="space-y-2 max-h-80 overflow-auto">
          {result.uploaded.map((u) => (
            <div
              key={u.mockupId}
              className={cn(
                'flex items-center justify-between gap-2 p-2 rounded border text-sm',
                u.error ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50',
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                {u.error ? (
                  <X className="w-4 h-4 text-red-600 shrink-0" />
                ) : (
                  <Check className="w-4 h-4 text-green-600 shrink-0" />
                )}
                <span className="truncate">{u.driveName || u.mockupName}</span>
              </div>
              {u.driveUrl && (
                <a
                  href={u.driveUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-600 hover:underline shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              {u.error && (
                <span className="text-xs text-red-600 truncate" title={u.error}>
                  {u.error}
                </span>
              )}
            </div>
          ))}

          {/* Design upload (subfolder "design") */}
          {result.design && (
            <div
              className={cn(
                'flex items-center justify-between gap-2 p-2 rounded border text-sm mt-3',
                result.design.error
                  ? 'border-red-200 bg-red-50'
                  : 'border-purple-200 bg-purple-50',
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                {result.design.error ? (
                  <X className="w-4 h-4 text-red-600 shrink-0" />
                ) : (
                  <Check className="w-4 h-4 text-purple-600 shrink-0" />
                )}
                <span className="truncate">
                  <span className="text-purple-700 font-medium">design/</span>{' '}
                  {result.design.name || 'design'}
                </span>
              </div>
              {result.design.driveUrl && (
                <a
                  href={result.design.driveUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-600 hover:underline shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              {result.design.error && (
                <span
                  className="text-xs text-red-600 truncate"
                  title={result.design.error}
                >
                  {result.design.error}
                </span>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Disconnect button */}
          <div className="flex items-center justify-end text-xs">
            <button
              className="text-red-600 hover:underline flex items-center gap-1"
              onClick={() => disconnectMut.mutate()}
            >
              <LogOut className="w-3 h-3" /> Disconnect
            </button>
          </div>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded px-2 py-1.5 overflow-x-auto whitespace-nowrap">
            {path.length > 1 && (
              <button
                onClick={goBack}
                className="text-slate-500 hover:text-slate-800 mr-1 shrink-0"
                title="Quay lại"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            )}
            {path.map((node, i) => (
              <span key={i} className="flex items-center gap-1 shrink-0">
                {i > 0 && <ChevronRight className="w-3 h-3 text-slate-400" />}
                <button
                  onClick={() => jumpTo(i)}
                  className={cn(
                    'hover:underline',
                    i === path.length - 1 ? 'font-semibold text-slate-900' : 'text-slate-600',
                  )}
                >
                  {i === 0 ? (
                    <span className="flex items-center gap-1">
                      <Home className="w-3 h-3" /> {node.name}
                    </span>
                  ) : (
                    node.name
                  )}
                </button>
              </span>
            ))}
          </div>

          {/* Folder list */}
          <div>
            <Label>Subfolders</Label>
            {folders.isLoading ? (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            ) : folders.data && folders.data.length > 0 ? (
              <div className="max-h-56 overflow-auto border border-slate-200 rounded">
                {folders.data.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => enterFolder(f)}
                    className="w-full text-left px-3 py-2 text-sm border-b last:border-b-0 border-slate-100 hover:bg-slate-50 flex items-center justify-between gap-2 group"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                      <span className="truncate">{f.name}</span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 shrink-0" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-500 border border-dashed border-slate-300 rounded p-4 text-center">
                Không có subfolder. Tạo mới hoặc upload vào folder hiện tại.
              </div>
            )}
          </div>

          {/* Create folder */}
          <div className="border-t pt-3">
            <Label>Tạo folder mới trong "{currentFolder?.name}"</Label>
            <div className="flex gap-2">
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Tên folder"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newFolderName && !createMut.isPending) {
                    createMut.mutate();
                  }
                }}
              />
              <Button
                variant="secondary"
                onClick={() => createMut.mutate()}
                disabled={!newFolderName || createMut.isPending}
              >
                {createMut.isPending ? <Spinner /> : <FolderPlus className="w-4 h-4" />}
                Tạo
              </Button>
            </div>
          </div>

          <div className="text-xs text-slate-500 text-center pt-1">
            Sẽ upload <strong>{imageCount} ảnh</strong> vào{' '}
            <strong className="text-slate-700">{currentFolder?.name}</strong>
          </div>
        </div>
      )}
    </Modal>
  );
}
