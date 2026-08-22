import { Eye } from 'lucide-react';

/** Bật chế độ admin xem nội dung của mọi user (chỉ để đổi chủ sở hữu — vẫn không sửa được). */
export function AdminAllToggle({
  value,
  onChange,
  label = 'Xem của tất cả user',
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 accent-brand-600"
      />
      <Eye className="w-4 h-4" />
      {label}
    </label>
  );
}
