import { useState, useEffect } from 'react';
import { Task, Subject } from '../lib/db';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { modalIn } from '../lib/motion';
import { sanitizeDetails } from '../lib/utils';

interface TaskDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (taskData: Partial<Task>) => void;
  initialData?: Task;
  subjects: Subject[];
  lockedSubjectId?: string;
  defaultDate?: string;
  defaultType?: 'prep' | 'homework' | 'project' | 'subject_note';
}

export default function TaskDialog({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  subjects,
  lockedSubjectId,
  defaultDate,
  defaultType
}: TaskDialogProps) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'prep' | 'homework' | 'project' | 'subject_note'>('homework');
  const [details, setDetails] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [remindAt, setRemindAt] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [isImportant, setIsImportant] = useState(false);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setTitle(initialData.title);
        setType(initialData.type);
        setDetails(initialData.details || '');
        setDueAt(initialData.due_at ? initialData.due_at.slice(0, 16) : '');
        setRemindAt(initialData.remind_at ? initialData.remind_at.slice(0, 16) : '');
        setSubjectId(initialData.subject_id || '');
        setIsImportant(initialData.is_important);
        setIsDone(initialData.is_done);
      } else {
        setTitle('');
        setType(defaultType || 'homework');
        setDetails('');
        setDueAt(defaultDate ? `${defaultDate}T00:00` : '');
        setRemindAt('');
        setSubjectId(lockedSubjectId || '');
        setIsImportant(false);
        setIsDone(false);
      }
    }
  }, [isOpen, initialData, lockedSubjectId, defaultDate, defaultType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    
    if ((type === 'homework' || type === 'project') && !dueAt) {
      alert('تاريخ التسليم مطلوب لهذا النوع من المهام');
      return;
    }

    const sanitizedDetails = sanitizeDetails(details);

    onSubmit({
      title,
      type,
      details: sanitizedDetails,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
      remind_at: remindAt ? new Date(remindAt).toISOString() : null,
      subject_id: subjectId || null,
      is_important: isImportant,
      is_done: isDone,
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[var(--primary)]/50 backdrop-blur-sm" 
            onClick={onClose} 
          />
          <motion.div 
            variants={modalIn}
            initial="initial"
            animate="animate"
            exit="exit"
            className="relative w-full max-w-md rounded-2xl bg-[var(--card)] p-6 shadow-xl border border-[var(--border)] theme-transition"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-[var(--text)]">
                {initialData ? 'تعديل المهمة' : 'مهمة جديدة'}
              </h2>
              <button onClick={onClose} className="rounded-full p-2 text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-[var(--text)]">عنوان المهمة *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-[var(--text)]">النوع *</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  >
                    <option value="homework">واجب</option>
                    <option value="prep">تحضير</option>
                    <option value="project">مشروع</option>
                    <option value="subject_note">ملاحظة</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-[var(--text)]">المادة</label>
                  <select
                    value={subjectId}
                    onChange={(e) => setSubjectId(e.target.value)}
                    disabled={!!lockedSubjectId}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] disabled:opacity-50"
                  >
                    <option value="">بدون مادة</option>
                    {subjects.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-[var(--text)]">التفاصيل</label>
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-[var(--text)]">تاريخ التسليم {(type === 'homework' || type === 'project') && '*'}</label>
                  <input
                    type="datetime-local"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                    required={type === 'homework' || type === 'project'}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-[var(--text)]">تذكير في</label>
                  <input
                    type="datetime-local"
                    value={remindAt}
                    onChange={(e) => setRemindAt(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4 pt-2">
                <label className="flex items-center gap-2 text-sm font-medium text-[var(--text)]">
                  <input
                    type="checkbox"
                    checked={isImportant}
                    onChange={(e) => setIsImportant(e.target.checked)}
                    className="h-4 w-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                  />
                  مهم ⭐
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-[var(--text)]">
                  <input
                    type="checkbox"
                    checked={isDone}
                    onChange={(e) => setIsDone(e.target.checked)}
                    className="h-4 w-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                  />
                  مكتمل ✅
                </label>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--bg)]"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
                >
                  حفظ
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
