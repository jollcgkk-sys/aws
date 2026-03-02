import { CheckCircle2, Clock } from 'lucide-react';
import { cn } from '../lib/utils';

export default function SyncBadge({ status }: { status?: 'synced' | 'pending' }) {
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-600 ring-1 ring-inset ring-amber-500/10">
        <Clock className="h-3 w-3" />
        غير مرفوع ⏳
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-600 ring-1 ring-inset ring-emerald-500/10">
      <CheckCircle2 className="h-3 w-3" />
      تم الرفع ✅
    </span>
  );
}
