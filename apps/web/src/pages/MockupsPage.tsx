import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRightLeft, Pencil, Plus, Share2, Trash2, Upload, Users } from 'lucide-react';
import {
  listMockups,
  uploadMockup,
  deleteMockup,
  listMockupShares,
  addMockupShare,
  removeMockupShare,
} from '../api/mockups';
import { Button, Card, EmptyState, Input, Label, Modal, Spinner } from '../components/ui';
import { ShareModal } from '../components/ShareModal';
import { AdminAllToggle } from '../components/AdminAllToggle';
import { TransferOwnerModal } from '../components/TransferOwnerModal';
import { useAuth } from '../contexts/AuthContext';

export default function MockupsPage() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [shareFor, setShareFor] = useState<{ id: string; name: string } | null>(null);
  const [ownerFor, setOwnerFor] = useState<{ id: string; name: string } | null>(null);
  const [showAll, setShowAll] = useState(false);

  const adminAll = isAdmin && showAll;
  const { data: mockups = [], isLoading } = useQuery({
    queryKey: ['mockups', adminAll ? 'all' : 'mine'],
    queryFn: () => listMockups(adminAll),
  });

  const uploadMut = useMutation({
    mutationFn: () => uploadMockup(file!, name || file!.name),
    onSuccess: () => {
      toast.success('Đã upload mockup');
      qc.invalidateQueries({ queryKey: ['mockups'] });
      setOpen(false);
      setName('');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteMockup(id),
    onSuccess: () => {
      toast.success('Đã xoá');
      qc.invalidateQueries({ queryKey: ['mockups'] });
    },
  });

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Mockups</h1>
          <p className="text-sm text-slate-500 mt-1">Quản lý ảnh nền và vùng đặt design.</p>
        </div>
        <div className="flex items-center gap-4">
          {isAdmin && <AdminAllToggle value={showAll} onChange={setShowAll} />}
          <Button onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4" /> Thêm mockup
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : mockups.length === 0 ? (
        <EmptyState title="Chưa có mockup nào" hint="Bấm “Thêm mockup” để upload ảnh đầu tiên." />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {mockups.map((m) => (
            <Card key={m.id} className="overflow-hidden group">
              <div className="aspect-[5/7] bg-slate-100 overflow-hidden relative">
                <img src={m.fileUrl} alt={m.name} className="w-full h-full object-contain" />
                {m.shared && (
                  <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[11px] bg-amber-500 text-white px-1.5 py-0.5 rounded">
                    <Users className="w-3 h-3" /> {m.ownerName || 'chia sẻ'}
                  </span>
                )}
              </div>
              <div className="p-3">
                <div className="font-medium text-sm truncate" title={m.name}>{m.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{m.width}×{m.height} px</div>
                {m.shared ? (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="flex-1 text-xs text-slate-400 italic truncate">
                      {adminAll
                        ? `Chủ: ${m.ownerName || '—'}`
                        : 'Được chia sẻ — chỉ dùng để generate'}
                    </span>
                    {isAdmin && (
                      <Button
                        variant="secondary"
                        size="sm"
                        title="Đổi chủ sở hữu"
                        onClick={() => setOwnerFor({ id: m.id, name: m.name })}
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-2 mt-3">
                    <Link to={`/mockups/${m.id}/edit`} className="flex-1">
                      <Button variant="secondary" size="sm" className="w-full">
                        <Pencil className="w-3.5 h-3.5" /> Sửa
                      </Button>
                    </Link>
                    <Button
                      variant="secondary"
                      size="sm"
                      title="Chia sẻ"
                      onClick={() => setShareFor({ id: m.id, name: m.name })}
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </Button>
                    {isAdmin && (
                      <Button
                        variant="secondary"
                        size="sm"
                        title="Đổi chủ sở hữu"
                        onClick={() => setOwnerFor({ id: m.id, name: m.name })}
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Xoá "${m.name}"?`)) deleteMut.mutate(m.id);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <TransferOwnerModal
        open={!!ownerFor}
        type="mockup"
        ids={ownerFor ? [ownerFor.id] : []}
        subject={ownerFor?.name}
        onClose={() => setOwnerFor(null)}
      />

      <ShareModal
        open={!!shareFor}
        resourceId={shareFor?.id ?? null}
        resourceName={shareFor?.name}
        onClose={() => setShareFor(null)}
        listKey="mockups"
        listShares={listMockupShares}
        addShare={addMockupShare}
        removeShare={removeMockupShare}
      />

      <Modal
        open={open}
        onClose={() => !uploadMut.isPending && setOpen(false)}
        title="Thêm mockup mới"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={uploadMut.isPending}>
              Huỷ
            </Button>
            <Button
              onClick={() => uploadMut.mutate()}
              disabled={!file || uploadMut.isPending}
            >
              {uploadMut.isPending ? <Spinner /> : <Upload className="w-4 h-4" />} Upload
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <Label>Tên mockup</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="vd: T-shirt Black Front" />
          </div>
          <div>
            <Label>File ảnh (PNG/JPG)</Label>
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
