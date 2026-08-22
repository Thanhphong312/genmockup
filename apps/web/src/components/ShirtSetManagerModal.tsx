import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2, Upload, X } from 'lucide-react';
import { getShirtSet, uploadShirtVariant, deleteShirtVariant } from '../api/shirtSets';
import { Button, Input, Spinner } from './ui';
import { thumb } from '../lib/img';

const apiErr = (e: any) => e?.response?.data?.message || e?.response?.data?.error || e?.message || 'Lỗi';

/** Modal quản lý các variant màu của 1 bộ áo: upload nhiều màu + xoá từng màu. */
export function ShirtSetManagerModal({
  setId,
  open,
  onClose,
}: {
  setId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [color, setColor] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: set, isLoading } = useQuery({
    queryKey: ['shirt-set', setId],
    queryFn: () => getShirtSet(setId!),
    enabled: open && !!setId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['shirt-set', setId] });
    qc.invalidateQueries({ queryKey: ['shirt-sets'] });
  };

  const delMut = useMutation({
    mutationFn: (variantId: string) => deleteShirtVariant(setId!, variantId),
    onSuccess: () => {
      toast.success('Đã xoá màu');
      invalidate();
    },
    onError: (e: any) => toast.error(apiErr(e)),
  });

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length || !setId) return;
    const list = Array.from(files);
    setBusy(true);
    let ok = 0;
    for (const f of list) {
      try {
        // 1 ảnh → dùng ô tên màu; nhiều ảnh → màu lấy theo tên file.
        const c = list.length === 1 && color.trim() ? color.trim() : f.name.replace(/\.[^.]+$/, '');
        await uploadShirtVariant(setId, c, f);
        ok++;
      } catch (e: any) {
        toast.error(`${f.name}: ${apiErr(e)}`);
      }
    }
    setBusy(false);
    setColor('');
    if (fileRef.current) fileRef.current.value = '';
    if (ok) toast.success(`Đã thêm ${ok} màu`);
    invalidate();
  }

  if (!open || !setId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-auto rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="font-semibold text-slate-900">Quản lý màu — {set?.name ?? ''}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex-1 min-w-[160px]">
              <label className="text-xs font-medium text-slate-600">Tên màu (bỏ trống = theo tên file)</label>
              <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="vd: black" />
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? <Spinner /> : <Upload className="w-4 h-4" />} Thêm màu (chọn ảnh)
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            1 ảnh → dùng ô tên màu ở trên. Nhiều ảnh → mỗi ảnh là 1 màu lấy theo <b>tên file</b>. Trùng màu sẽ thay ảnh.
          </p>

          {isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : !set || set.variants.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">Bộ trống — thêm màu ở trên.</div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {set.variants.map((v) => (
                <div key={v.id} className="group relative overflow-hidden rounded-lg border border-slate-200">
                  <img src={thumb(v.fileUrl, 200)} alt={v.color} loading="lazy" className="aspect-[5/7] w-full bg-slate-100 object-cover" />
                  <div className="truncate px-2 py-1 text-xs text-slate-600" title={v.color}>
                    {v.color}
                  </div>
                  <button
                    onClick={() => {
                      if (confirm(`Xoá màu "${v.color}"?`)) delMut.mutate(v.id);
                    }}
                    className="absolute right-1.5 top-1.5 rounded bg-red-500/85 p-1 text-white opacity-0 transition group-hover:opacity-100"
                    title="Xoá màu"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
