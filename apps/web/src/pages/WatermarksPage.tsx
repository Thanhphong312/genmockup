import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRightLeft, Plus, Trash2, Upload, Users } from 'lucide-react';
import { listWatermarks, uploadWatermark, deleteWatermark } from '../api/watermarks';
import { Button, Card, EmptyState, Input, Label, Modal, Spinner } from '../components/ui';
import { AdminAllToggle } from '../components/AdminAllToggle';
import { TransferOwnerModal } from '../components/TransferOwnerModal';
import { useAuth } from '../contexts/AuthContext';

export default function WatermarksPage() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [ownerFor, setOwnerFor] = useState<{ id: string; name: string } | null>(null);
  const [showAll, setShowAll] = useState(false);

  const adminAll = isAdmin && showAll;
  const { data: watermarks = [], isLoading } = useQuery({
    queryKey: ['watermarks', adminAll ? 'all' : 'mine'],
    queryFn: () => listWatermarks(adminAll),
  });

  const uploadMut = useMutation({
    mutationFn: () => uploadWatermark(file!, name || file!.name),
    onSuccess: () => {
      toast.success('Đã upload watermark');
      qc.invalidateQueries({ queryKey: ['watermarks'] });
      setOpen(false);
      setName('');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteWatermark(id),
    onSuccess: () => {
      toast.success('Đã xoá');
      qc.invalidateQueries({ queryKey: ['watermarks'] });
    },
  });

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Watermarks</h1>
          <p className="text-sm text-slate-500 mt-1">
            Upload ảnh watermark. Vị trí được set ở từng mockup.
          </p>
        </div>
        <div className="flex items-center gap-4">
          {isAdmin && <AdminAllToggle value={showAll} onChange={setShowAll} />}
          <Button onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4" /> Thêm watermark
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : watermarks.length === 0 ? (
        <EmptyState title="Chưa có watermark nào" />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {watermarks.map((w) => (
            <Card key={w.id} className="overflow-hidden">
              <div className="aspect-square bg-[repeating-conic-gradient(#f1f5f9_0_25%,#fff_0_50%)] [background-size:20px_20px] overflow-hidden relative">
                <img src={w.fileUrl} alt={w.name} className="w-full h-full object-contain" />
                {w.shared && (
                  <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[11px] bg-amber-500 text-white px-1.5 py-0.5 rounded">
                    <Users className="w-3 h-3" /> {w.ownerName || '—'}
                  </span>
                )}
              </div>
              <div className="p-3">
                <div className="font-medium text-sm truncate" title={w.name}>{w.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{w.width}×{w.height} px</div>
                <div className="mt-3 flex gap-2">
                  {w.shared ? (
                    <span className="flex-1 text-xs text-slate-400 italic self-center truncate">
                      Chủ: {w.ownerName || '—'}
                    </span>
                  ) : (
                    <Button
                      variant="danger"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        if (confirm(`Xoá "${w.name}"?`)) deleteMut.mutate(w.id);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Xoá
                    </Button>
                  )}
                  {isAdmin && (
                    <Button
                      variant="secondary"
                      size="sm"
                      title="Đổi chủ sở hữu"
                      onClick={() => setOwnerFor({ id: w.id, name: w.name })}
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <TransferOwnerModal
        open={!!ownerFor}
        type="watermark"
        ids={ownerFor ? [ownerFor.id] : []}
        subject={ownerFor?.name}
        onClose={() => setOwnerFor(null)}
      />

      <Modal
        open={open}
        onClose={() => !uploadMut.isPending && setOpen(false)}
        title="Thêm watermark mới"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={uploadMut.isPending}>
              Huỷ
            </Button>
            <Button onClick={() => uploadMut.mutate()} disabled={!file || uploadMut.isPending}>
              {uploadMut.isPending ? <Spinner /> : <Upload className="w-4 h-4" />} Upload
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <Label>Tên</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="vd: Bullstart logo" />
          </div>
          <div>
            <Label>File PNG (nên có nền trong)</Label>
            <Input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
