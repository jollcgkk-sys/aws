import { useState, useEffect } from 'react';
import { DayNote } from '../lib/db';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { modalIn } from '../lib/motion';

interface DayNoteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (noteData: Partial<DayNote>) => void;
  initialData?: DayNote;
  defaultDate?: string;
  defaultDayOfWeek?: number;
}

export default function DayNoteDialog({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  defaultDate,
  defaultDayOfWeek
}: DayNoteDialogProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [noteDate, setNoteDate] = useState('');
  const [remindAt, setRemindAt] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setTitle(initialData.title || '');
        setContent(initialData.content);
        setNoteDate(initialData.note_date ? initialData.note_date.split('T')[0] : '');
        setRemindAt(initialData.remind_at ? initialData.remind_at.slice(0, 16) : '');
      } else {
        setTitle('');
        setContent('');
        setNoteDate(defaultDate || '');
        setRemindAt('');
      }
    }
  }, [isOpen, initialData, defaultDate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    onSubmit({
      title: title || null,
      content,
      note_date: noteDate ? new Date(noteDate).toISOString() : null,
      remind_at: remindAt ? new Date(remindAt).toISOString() : null,
      day_of_week: defaultDayOfWeek !== undefined ? defaultDayOfWeek : null,
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
                {initialData ? 'تعديل الملاحظة' : 'ملاحظة يومية جديدة'}
              </h2>
              <button onClick={onClose} className="rounded-full p-2 text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-[var(--text)]">العنوان (اختياري)</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-[var(--text)]">المحتوى *</label>
                <textarea
                  required
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-[var(--text)]">التاريخ</label>
                  <input
                    type="date"
                    value={noteDate}
                    onChange={(e) => setNoteDate(e.target.value)}
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
