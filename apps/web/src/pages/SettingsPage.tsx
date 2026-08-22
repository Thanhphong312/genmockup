import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Save, Cloud, Check, LogOut, Upload, LogIn } from 'lucide-react';
import { getSettings, updateSettings } from '../api/settings';
import { disconnectDrive, getDriveStatus, getOAuthStartUrl, importDriveToken } from '../api/drive';
import { Button, Card, Input, Label, Spinner } from '../components/ui';

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({ queryKey: ['settings'], queryFn: getSettings });

  const [apiKey, setApiKey] = useState('');
  const [imageQuality, setImageQuality] = useState('medium');
  const [analysisModel, setAnalysisModel] = useState('gpt-4o');
  const [imageModel, setImageModel] = useState('gpt-image-1');

  useEffect(() => {
    if (!settings) return;
    setImageQuality(settings.imageQuality);
    setAnalysisModel(settings.analysisModel);
    setImageModel(settings.imageModel);
  }, [settings]);

  const mut = useMutation({
    mutationFn: () =>
      updateSettings({
        openaiApiKey: apiKey || undefined,
        imageQuality,
        analysisModel,
        imageModel,
      }),
    onSuccess: () => {
      toast.success('Đã lưu cấu hình');
      setApiKey('');
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  // ---- Google Drive ----
  const [driveJson, setDriveJson] = useState('');
  const driveStatus = useQuery({ queryKey: ['drive-status'], queryFn: getDriveStatus });

  const importMut = useMutation({
    mutationFn: () => importDriveToken(driveJson),
    onSuccess: () => {
      toast.success('Đã kết nối Google Drive');
      setDriveJson('');
      qc.invalidateQueries({ queryKey: ['drive-status'] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || 'Token không hợp lệ hoặc verify thất bại'),
  });

  const disconnectMut = useMutation({
    mutationFn: disconnectDrive,
    onSuccess: () => {
      toast.success('Đã ngắt kết nối Drive');
      qc.invalidateQueries({ queryKey: ['drive-status'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>;

  return (
    <div className="p-4 sm:p-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">Cài đặt</h1>
      <p className="text-sm text-slate-500 mb-6">Cấu hình OpenAI cho tính năng New Idea.</p>

      <Card className="p-5 space-y-4">
        <div>
          <Label>OpenAI API Key</Label>
          <Input
            type="password"
            autoComplete="off"
            placeholder={
              settings?.hasOpenaiKey
                ? `Đã lưu (••••${settings.openaiKeyLast4}) — nhập để thay`
                : 'sk-...'
            }
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <p className="text-xs text-slate-500 mt-1">
            Key lưu ở server (không hiển thị lại). Để trống khi lưu = giữ key cũ.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Model phân tích</Label>
            <Input value={analysisModel} onChange={(e) => setAnalysisModel(e.target.value)} />
          </div>
          <div>
            <Label>Model tạo ảnh</Label>
            <Input value={imageModel} onChange={(e) => setImageModel(e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Chất lượng ảnh</Label>
          <select
            value={imageQuality}
            onChange={(e) => setImageQuality(e.target.value)}
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
          >
            <option value="low">low (rẻ, nhanh)</option>
            <option value="medium">medium</option>
            <option value="high">high (đẹp, tốn hơn)</option>
            <option value="auto">auto</option>
          </select>
        </div>

        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? <Spinner /> : <Save className="w-4 h-4" />} Lưu
        </Button>
      </Card>

      <Card className="p-5 space-y-4 mt-6">
        <div className="flex items-center gap-2">
          <Cloud className="w-5 h-5 text-brand-600" />
          <h2 className="text-lg font-semibold">Google Drive</h2>
          {driveStatus.data?.authenticated && (
            <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
              <Check className="w-3 h-3" /> Đã kết nối
            </span>
          )}
        </div>

        {driveStatus.isLoading ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : driveStatus.data?.authenticated ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Tài khoản này đã kết nối Drive. Ảnh generate có thể upload trực tiếp lên Drive của bạn.
            </p>
            <Button
              variant="ghost"
              className="text-red-600"
              onClick={() => disconnectMut.mutate()}
              disabled={disconnectMut.isPending}
            >
              {disconnectMut.isPending ? <Spinner /> : <LogOut className="w-4 h-4" />} Ngắt kết nối
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {driveStatus.data?.configured && (
              <div className="space-y-2 pb-2">
                <p className="text-sm text-slate-600">
                  Kết nối nhanh bằng tài khoản Google (server đã cấu hình OAuth sẵn):
                </p>
                <Button
                  onClick={() => {
                    window.location.href = getOAuthStartUrl(window.location.href);
                  }}
                >
                  <LogIn className="w-4 h-4" /> Kết nối Google Drive
                </Button>
                <div className="flex items-center gap-3 pt-1">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-xs text-slate-400">hoặc dán JSON thủ công</span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
              </div>
            )}
            <p className="text-sm text-slate-600">
              Dán JSON token (tự tạo Google Cloud OAuth và lấy <code>refresh_token</code> — xem{' '}
              <a href="/docs#drive" className="text-brand-600 hover:underline">
                hướng dẫn chi tiết
              </a>
              ). Cần đủ <code>client_id</code>, <code>client_secret</code>,{' '}
              <code>refresh_token</code>.
            </p>
            <div>
              <Label>Token JSON</Label>
              <textarea
                value={driveJson}
                onChange={(e) => setDriveJson(e.target.value)}
                rows={7}
                spellCheck={false}
                placeholder={
                  '{\n  "client_id": "xxx.apps.googleusercontent.com",\n  "client_secret": "GOCSPX-...",\n  "refresh_token": "1//0g..."\n}'
                }
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-mono resize-y"
              />
              <p className="text-xs text-slate-500 mt-1">
                Hệ thống sẽ thử refresh token để xác minh trước khi lưu.
              </p>
            </div>
            <Button
              onClick={() => importMut.mutate()}
              disabled={!driveJson.trim() || importMut.isPending}
            >
              {importMut.isPending ? <Spinner /> : <Upload className="w-4 h-4" />} Kết nối bằng JSON
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
