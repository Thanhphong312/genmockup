import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Sparkles } from 'lucide-react';
import type { IdeaImage } from '@genmockup/shared';
import { genIdeaTitle } from '../api/ideas';
import { Button, Input, Label, Modal, Spinner } from './ui';

interface Props {
  idea: IdeaImage | null;
  open: boolean;
  onClose: () => void;
}

export function GenTitleModal({ idea, open, onClose }: Props) {
  const qc = useQueryClient();
  const [template, setTemplate] = useState('');
  const [keyword, setKeyword] = useState('');
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (open) {
      setTemplate('');
      setKeyword(idea?.keyword || ''); // mang keyword cũ sang
      setTitle(idea?.title || '');
    }
  }, [open, idea]);

  const mut = useMutation({
    mutationFn: () => genIdeaTitle(idea!.id, template, keyword),
    onSuccess: (updated) => {
      setTitle(updated.title || '');
      qc.invalidateQueries({ queryKey: ['ideas'] });
      toast.success('Đã gen & lưu title');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(title);
      toast.success('Đã copy title');
    } catch {
      toast.error('Không copy được');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Gen title đăng bán"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Đóng</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? <Spinner /> : <Sparkles className="w-4 h-4" />} Gen title
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>Title mẫu (template / format)</Label>
          <Input
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            placeholder="vd: {keyword} Shirt, Funny {theme} Tee, Gift Idea"
          />
          <p className="text-xs text-slate-500 mt-1">Để trống = AI tự chọn format hấp dẫn.</p>
        </div>
        <div>
          <Label>Keyword</Label>
          <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="vd: cat lover, vintage" />
        </div>

        {title && (
          <div>
            <Label>Title đã gen</Label>
            <div className="flex items-start gap-2">
              <div className="flex-1 rounded-md border border-slate-200 bg-slate-50 p-2 text-sm">{title}</div>
              <Button variant="secondary" size="sm" onClick={copy}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
            <p className="text-xs text-slate-400 mt-1">{title.length} ký tự</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
