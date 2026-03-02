import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Subject, Task } from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import { useSync } from '../contexts/SyncContext';
import { queueMutation } from '../lib/sync';
import { uuid } from '../lib/uuid';
import { Plus, Trash2, Edit2, Zap, RefreshCw, Loader2 } from 'lucide-react';
import SyncBadge from '../components/SyncBadge';
import QuickAddDialog from '../components/QuickAddDialog';
import { motion } from 'motion/react';
import { pageTransition, listStagger, cardIn } from '../lib/motion';
import { ensureAppDataLoaded } from '../lib/appDataLoader';

export default function Subjects() {
  const { user } = useAuth();
  const { isSyncing, triggerSync } = useSync();
  const subjects = useLiveQuery(async () => {
    if (!user?.id) return [];
    return db.subjects.where('user_id').equals(user.id).toArray();
  }, [user?.id]) ?? [];
  
  const schedule = useLiveQuery(() => db.weekly_schedule.where('user_id').equals(user?.id || '').toArray(), [user?.id]) || [];
  const slotTimes = useLiveQuery(() => db.slot_times.where('user_id').equals(user?.id || '').toArray(), [user?.id]) || [];

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (user && subjects.length === 0) {
      // If empty, try to ensure loaded, but rely on SyncController mostly
      ensureAppDataLoaded(user.id).catch(err => {
        console.error('Failed to ensure app data loaded:', err);
      });
    }
  }, [user, subjects.length]);

  const handleForceRefresh = async () => {
    if (!user) return;
    setIsRefreshing(true);
    try {
      await triggerSync();
    } catch (error) {
      console.error('Error during force refresh:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name.trim()) return;

    try {
      if (editingId) {
        const subject = await db.subjects.get(editingId);
        if (subject) {
          await queueMutation('update_subject', { ...subject, name, color }, user.id);
        }
        setEditingId(null);
      } else {
        const newSubject: Subject = {
          id: uuid(),
          user_id: user.id,
          name,
          color,
          created_at: new Date().toISOString(),
        };
        await queueMutation('create_subject', newSubject, user.id);
      }
      setName('');
      setColor('#6366f1');
      setIsAdding(false);
    } catch (error) {
      console.error('Failed to save subject:', error);
      alert('حدث خطأ أثناء حفظ المادة. يرجى المحاولة مرة أخرى.');
    }
  };

  const handleEdit = (subject: Subject) => {
    setName(subject.name);
    setColor(subject.color);
    setEditingId(subject.id);
    setIsAdding(true);
  };

  const handleDelete = (id: string) => {
    console.log('[DELETE CLICK] id=', id);
    console.log('[CONFIRM] typeof confirm=', typeof window.confirm);
    try {
      // Just probing confirm availability as requested, not using it for logic
      const confirmType = typeof window.confirm;
      console.log('[CONFIRM PROBE] typeof window.confirm is', confirmType);
    } catch (e) {
      console.warn('[CONFIRM BLOCKED]', e);
    }
    setDeleteConfirmId(id);
  };

  const confirmDelete = async () => {
    if (!user || !deleteConfirmId) return;
    const id = deleteConfirmId;
    
    try {
      console.log('[UI DELETE CONFIRMED] subjectId=', id);
      console.log('[UI DELETE] before queue pending count=', await db.pending_mutations.where("user_id").equals(user.id).count());

      const relatedTasks = await db.tasks.where('subject_id').equals(id).toArray();
      const relatedSchedule = await db.weekly_schedule.where('subject_id').equals(id).toArray();

      for (const task of relatedTasks) {
        await queueMutation('delete_task', { id: task.id }, user.id);
        console.log('[UI DELETE] queued delete_task', task.id);
      }

      for (const slot of relatedSchedule) {
        await queueMutation('delete_schedule', { id: slot.id }, user.id);
        console.log('[UI DELETE] queued delete_schedule', slot.id);
      }

      await queueMutation('delete_subject', { id, user_id: user.id }, user.id);
      console.log('[UI DELETE] queued delete_subject', id);
      
      setDeleteConfirmId(null);
    } catch (error) {
      console.error('Error deleting subject and related data:', error);
      alert('حدث خطأ أثناء حذف المادة. يرجى المحاولة مرة أخرى.');
    }
  };

  const handleTaskSubmit = async (taskData: Partial<Task>) => {
    if (!user) return;
    const newTask: Task = {
      id: uuid(),
      user_id: user.id,
      subject_id: taskData.subject_id || null,
      type: taskData.type as any,
      title: taskData.title || '',
      details: taskData.details || '',
      due_at: taskData.due_at || null,
      remind_at: taskData.remind_at || null,
      is_done: taskData.is_done || false,
      is_important: taskData.is_important || false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await queueMutation('create_task', newTask, user.id);
  };

  return (
    <motion.div 
      variants={pageTransition}
      initial="initial"
      animate="animate"
      exit="exit"
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text)]">المواد الدراسية</h2>
          <p className="text-xs text-[var(--muted)]">Subjects loaded: {subjects.length}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleForceRefresh}
            disabled={isRefreshing || isSyncing}
            className="flex items-center gap-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--card)] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing || isSyncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">تحديث الآن</span>
          </button>
          <button
            onClick={() => setIsQuickAddOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-200 transition-colors"
          >
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">إضافة سريعة</span>
          </button>
          <button
            onClick={() => {
              setIsAdding(true);
              setEditingId(null);
              setName('');
              setColor('#6366f1');
            }}
            className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">إضافة مادة</span>
          </button>
        </div>
      </div>

      {subjects.length === 0 && !isAdding && (
        <motion.div 
          variants={cardIn}
          className="col-span-full flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] py-12 text-center"
        >
          {isSyncing ? (
            <>
              <Loader2 className="h-8 w-8 text-[var(--primary)] animate-spin mb-4" />
              <p className="text-sm text-[var(--muted)]">جاري جلب المواد من السحابة...</p>
            </>
          ) : (
            <>
              <p className="text-sm text-[var(--muted)] mb-4">لا توجد مواد محلياً، جاري التحديث...</p>
              <button
                onClick={handleForceRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-2 rounded-lg bg-[var(--primary)]/10 px-4 py-2 text-sm font-medium text-[var(--primary)] hover:bg-[var(--primary)]/20 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>تحديث الآن</span>
              </button>
            </>
          )}
        </motion.div>
      )}

      {isAdding && (
        <form 
          onSubmit={handleSubmit} 
          className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm theme-transition"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <label className="text-sm font-medium text-[var(--text)]">اسم المادة</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                placeholder="مثال: رياضيات"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-[var(--text)]">اللون</label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-16 cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--card)]"
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
          </div>
        </form>
      )}

      <div 
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 relative z-10"
      >
        {subjects.map((subject) => (
          <div 
            key={subject.id} 
            className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm theme-transition hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="h-4 w-4 rounded-full"
                  style={{ backgroundColor: subject.color }}
                />
                <h3 className="font-semibold text-[var(--text)]">{subject.name}</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleEdit(subject)}
                  className="rounded-lg p-1 text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--primary)] transition-colors"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(subject.id)}
                  className="rounded-lg p-1 text-[var(--muted)] hover:bg-red-50 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between mt-auto pt-2 border-t border-[var(--border)]">
              <span className="text-xs text-[var(--muted)]">
                {new Date(subject.created_at).toLocaleDateString('ar-EG')}
              </span>
              <SyncBadge status={subject.sync_status} />
            </div>
          </div>
        ))}
      </div>

      <QuickAddDialog
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onSubmit={handleTaskSubmit}
        subjects={subjects}
        schedule={schedule}
        slotTimes={slotTimes}
      />

      {/* Custom Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-xl bg-[var(--card)] p-6 shadow-xl border border-[var(--border)]"
          >
            <h3 className="text-lg font-bold text-[var(--text)] mb-2">حذف المادة</h3>
            <p className="text-[var(--muted)] mb-6">
              هل أنت متأكد من حذف هذه المادة؟ سيتم حذف جميع المهام والحصص المرتبطة بها نهائياً.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--bg)] transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={confirmDelete}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
              >
                حذف نهائي
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
