import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRightLeft, Images, Pencil, Plus, RefreshCw, Share2, Trash2, Users } from 'lucide-react';
import {
  listShirtSets,
  scanShirtSets,
  createShirtSet,
  deleteShirtSet,
  listShirtSetShares,
  addShirtSetShare,
  removeShirtSetShare,
} from '../api/shirtSets';
import { Button, Card, EmptyState, Input, Spinner } from '../components/ui';
import { ShareModal } from '../components/ShareModal';
import { ShirtSetManagerModal } from '../components/ShirtSetManagerModal';
import { AdminAllToggle } from '../components/AdminAllToggle';
import { TransferOwnerModal } from '../components/TransferOwnerModal';
import { useAuth } from '../contexts/AuthContext';
import { thumb } from '../lib/img';

export default function ShirtSetsPage() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [shareFor, setShareFor] = useState<{ id: string; name: string } | null>(null);
  const [ownerFor, setOwnerFor] = useState<{ id: string; name: string } | null>(null);
  const [manageFor, setManageFor] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [showAll, setShowAll] = useState(false);

  const adminAll = isAdmin && showAll;
  const { data: sets = [], isLoading } = useQuery({
    queryKey: ['shirt-sets', adminAll ? 'all' : 'mine'],
    queryFn: () => listShirtSets(adminAll),
  });

  const createMut = useMutation({
    mutationFn: (name: string) => createShirtSet(name),
    onSuccess: (set) => {
      toast.success(`Đã tạo bộ "${set.name}"`);
      setNewName('');
      qc.invalidateQueries({ queryKey: ['shirt-sets'] });
      setManageFor(set.id); // mở luôn modal thêm màu
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.error === 'name_taken' ? 'Tên bộ đã tồn tại' : e?.response?.data?.message || e.message),
  });

  const scanMut = useMutation({
    mutationFn: scanShirtSets,
    onSuccess: (r) => {
      toast.success(
        `Scan xong: ${r.scannedSets} bộ, +${r.createdSets} bộ mới, +${r.addedVariants} màu`,
      );
      qc.invalidateQueries({ queryKey: ['shirt-sets'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e?.response?.data?.error || e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteShirtSet(id),
    onSuccess: () => {
      toast.success('Đã xoá bộ');
      qc.invalidateQueries({ queryKey: ['shirt-sets'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  return (
    <div className="p-4 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Bộ áo (Shirt sets)</h1>
          <p className="text-sm text-slate-500 mt-1">
            Tạo bộ mới rồi upload từng màu, hoặc <code>Scan</code> import folder từ đĩa.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newName.trim()) createMut.mutate(newName.trim());
            }}
          >
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Tên bộ mới…"
              className="w-40"
            />
            <Button type="submit" disabled={createMut.isPending || !newName.trim()}>
              {createMut.isPending ? <Spinner /> : <Plus className="w-4 h-4" />} Tạo bộ
            </Button>
          </form>
          <Button variant="secondary" onClick={() => scanMut.mutate()} disabled={scanMut.isPending}>
            {scanMut.isPending ? <Spinner /> : <RefreshCw className="w-4 h-4" />} Scan/Import từ đĩa
          </Button>
          {isAdmin && <AdminAllToggle value={showAll} onChange={setShowAll} />}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : sets.length === 0 ? (
        <EmptyState
          title="Chưa có bộ áo nào"
          hint="Nhập tên bộ rồi bấm “Tạo bộ” để upload từng màu, hoặc “Scan/Import từ đĩa”."
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {sets.map((s) => (
            <Card key={s.id} className="overflow-hidden group">
              <div className="aspect-square bg-slate-100 overflow-hidden relative">
                {s.representativeUrl ? (
                  <img src={thumb(s.representativeUrl, 400)} alt={s.name} loading="lazy" className="w-full h-full object-contain" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                    (chưa có ảnh)
                  </div>
                )}
                {s.shared && (
                  <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[11px] bg-amber-500 text-white px-1.5 py-0.5 rounded">
                    <Users className="w-3 h-3" /> {s.ownerName || 'chia sẻ'}
                  </span>
                )}
              </div>
              <div className="p-3">
                <div className="font-medium text-sm truncate" title={s.name}>{s.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {s.variants.length} màu: {s.variants.map((v) => v.color).join(', ')}
                </div>
                {s.shared ? (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="flex-1 text-xs text-slate-400 italic truncate">
                      {adminAll
                        ? `Chủ: ${s.ownerName || '—'}`
                        : 'Được chia sẻ — chỉ dùng để generate'}
                    </span>
                    {isAdmin && (
                      <Button
                        variant="secondary"
                        size="sm"
                        title="Đổi chủ sở hữu"
                        onClick={() => setOwnerFor({ id: s.id, name: s.name })}
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Link to={`/shirt-sets/${s.id}/edit`} className="flex-1">
                      <Button variant="secondary" size="sm" className="w-full">
                        <Pencil className="w-3.5 h-3.5" /> Sửa vị trí
                      </Button>
                    </Link>
                    <Button
                      variant="secondary"
                      size="sm"
                      title="Quản lý màu"
                      onClick={() => setManageFor(s.id)}
                    >
                      <Images className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      title="Chia sẻ"
                      onClick={() => setShareFor({ id: s.id, name: s.name })}
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </Button>
                    {isAdmin && (
                      <Button
                        variant="secondary"
                        size="sm"
                        title="Đổi chủ sở hữu"
                        onClick={() => setOwnerFor({ id: s.id, name: s.name })}
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Xoá bộ "${s.name}"?`)) deleteMut.mutate(s.id);
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

      <ShareModal
        open={!!shareFor}
        resourceId={shareFor?.id ?? null}
        resourceName={shareFor?.name}
        onClose={() => setShareFor(null)}
        listKey="shirt-sets"
        listShares={listShirtSetShares}
        addShare={addShirtSetShare}
        removeShare={removeShirtSetShare}
      />

      <TransferOwnerModal
        open={!!ownerFor}
        type="shirtSet"
        ids={ownerFor ? [ownerFor.id] : []}
        subject={ownerFor?.name}
        onClose={() => setOwnerFor(null)}
      />

      <ShirtSetManagerModal setId={manageFor} open={!!manageFor} onClose={() => setManageFor(null)} />
    </div>
  );
}
