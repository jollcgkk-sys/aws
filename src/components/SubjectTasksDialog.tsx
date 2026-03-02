import React, { useState, useEffect } from 'react';
import { X, Plus, Zap, Loader2, Calendar } from 'lucide-react';
import { Task, Subject } from '../lib/db';
import { sanitizeDetails } from '../lib/utils';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-red-500 bg-red-50 rounded-lg border border-red-200 m-4">
          <h3 className="font-bold">Rendering Error</h3>
          <pre className="text-xs mt-2 overflow-auto whitespace-pre-wrap">{this.state.error?.message}</pre>
          <pre className="text-[10px] mt-1 text-red-400">{this.state.error?.stack}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}
import TaskCard from './TaskCard';
import TaskDialog from './TaskDialog';
import { useAuth } from '../contexts/AuthContext';
import { queueMutation } from '../lib/sync';
import { uuid } from '../lib/uuid';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { format, getISODay } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { modalIn, listStagger, cardIn } from '../lib/motion';

interface SubjectTasksDialogProps {
  isOpen: boolean;
  onClose: () => void;
  subject: Subject | null;
  subjects: Subject[];
}

export default function SubjectTasksDialog({ isOpen, onClose, subject, subjects }: SubjectTasksDialogProps) {
  const { user } = useAuth();
  const [filter, setFilter] = useState<'prep' | 'homework' | 'project' | 'all'>('prep');
  
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>(undefined);

  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [quickAddType, setQuickAddType] = useState<'prep' | 'homework' | 'project'>('homework');
  const [isManualDate, setIsManualDate] = useState(false);
  const [quickAddDate, setQuickAddDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const rawTasks = useLiveQuery(
    () => subject ? db.tasks.where('subject_id').equals(subject.id).toArray() : [],
    [subject?.id]
  ) || [];

  // Defensive: Ensure tasks is always an array and filter out invalid items
  const tasks = Array.isArray(rawTasks) ? rawTasks.filter(t => t && typeof t === 'object' && t.id) : [];

  const schedule = useLiveQuery(
    () => db.weekly_schedule.where('user_id').equals(user?.id || '').toArray(),
    [user?.id]
  ) || [];

  const slotTimes = useLiveQuery(
    () => db.slot_times.where('user_id').equals(user?.id || '').toArray(),
    [user?.id]
  ) || [];

  const arabicDayName = (dayOfWeek: number) => {
    const days = ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];
    return days[dayOfWeek];
  };

  const computeNextOccurrence = (dayOfWeek: number, timeStr: string) => {
    const now = new Date();
    const [hours, minutes] = timeStr.split(':').map(Number);
    
    let targetDate = new Date(now);
    targetDate.setHours(hours, minutes, 0, 0);

    // Normalize today's day to Mon=0, Sun=6
    const currentDayNormalized = getISODay(now) - 1;

    // dayOfWeek is already Mon=0 from DB
    let daysToAdd = (dayOfWeek - currentDayNormalized + 7) % 7;
    
    if (daysToAdd === 0 && targetDate <= now) {
      daysToAdd = 7;
    }
    
    targetDate.setDate(targetDate.getDate() + daysToAdd);
    return targetDate;
  };

  const getNextLectureDateTime = (subject_id: string) => {
    const subjectSchedule = schedule.filter(s => s.subject_id === subject_id);
    
    if (subjectSchedule.length > 0) {
      let earliest: Date | null = null;
      
      for (const slot of subjectSchedule) {
        let timeStr = slot.start_time;
        if (!timeStr) {
          const st = slotTimes.find(s => s.slot === slot.slot);
          if (st && st.start_time) {
            timeStr = st.start_time;
          } else {
            const defaults: Record<number, string> = {
              1: '08:30', 2: '10:30', 3: '12:30', 4: '14:30', 5: '16:30', 6: '18:30'
            };
            timeStr = defaults[slot.slot] || '08:30';
          }
        }
        
        const occurrence = computeNextOccurrence(slot.day_of_week, timeStr);
        if (!earliest || occurrence < earliest) {
          earliest = occurrence;
        }
      }
      
      return earliest;
    }
    
    // Fallback if no schedule
    const now = new Date();
    let fallbackTime = '08:30';
    if (slotTimes.length > 0) {
      const sortedSlots = [...slotTimes].sort((a, b) => a.slot - b.slot);
      const upcomingSlot = sortedSlots.find(s => {
        const [h, m] = s.start_time.split(':').map(Number);
        const d = new Date(now);
        d.setHours(h, m, 0, 0);
        return d > now;
      });
      
      if (upcomingSlot) {
        fallbackTime = upcomingSlot.start_time;
        const [h, m] = fallbackTime.split(':').map(Number);
        const d = new Date(now);
        d.setHours(h, m, 0, 0);
        return d;
      } else {
        fallbackTime = sortedSlots[0].start_time;
        const [h, m] = fallbackTime.split(':').map(Number);
        const d = new Date(now);
        d.setDate(d.getDate() + 1);
        d.setHours(h, m, 0, 0);
        return d;
      }
    } else {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(8, 30, 0, 0);
      return d;
    }
  };

  const nextLectureDate = subject ? getNextLectureDateTime(subject.id) : null;
  const nextLectureDisplay = nextLectureDate ? `المحاضرة القادمة: ${arabicDayName(getISODay(nextLectureDate) - 1)} ${format(nextLectureDate, 'HH:mm')} (${format(nextLectureDate, 'yyyy/MM/dd')})` : '';

  const handleOpenQuickAdd = () => {
    setIsQuickAddOpen(!isQuickAddOpen);
    if (!isQuickAddOpen && subject) {
      const nextLec = getNextLectureDateTime(subject.id);
      if (nextLec) {
        const tzOffset = nextLec.getTimezoneOffset() * 60000;
        const localISOTime = (new Date(nextLec.getTime() - tzOffset)).toISOString().slice(0, 16);
        setQuickAddDate(localISOTime);
      }
      setIsManualDate(false);
    }
  };

  if (!isOpen || !subject) return null;

  // Filter and sort tasks
  const filteredTasks = tasks.filter(t => {
    if (!t) return false;
    // Safe type check
    const type = t.type || 'prep';
    if (filter === 'all') return true;
    return type === filter;
  });

  const now = new Date().getTime();
  const sortedTasks = filteredTasks.sort((a, b) => {
    if (!a || !b) return 0;
    const aDone = !!a.is_done;
    const bDone = !!b.is_done;
    if (aDone !== bDone) return aDone ? 1 : -1;
    
    // Safe date parsing
    const getSafeTime = (dateStr: string | null | undefined) => {
      if (!dateStr) return Infinity;
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? Infinity : d.getTime();
    };

    const aTime = getSafeTime(a.due_at);
    const bTime = getSafeTime(b.due_at);
    
    const aOverdue = aTime < now;
    const bOverdue = bTime < now;

    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;

    return aTime - bTime;
  });

  const handleToggleDone = async (id: string, isDone: boolean) => {
    if (!user) return;
    const task = await db.tasks.get(id);
    if (task) {
      await queueMutation('update_task', { ...task, is_done: isDone, updated_at: new Date().toISOString() }, user.id);
    }
  };

  const handleToggleImportant = async (id: string, isImportant: boolean) => {
    if (!user) return;
    const task = await db.tasks.get(id);
    if (task) {
      await queueMutation('update_task', { ...task, is_important: isImportant, updated_at: new Date().toISOString() }, user.id);
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!user) return;
    await queueMutation('delete_task', { id }, user.id);
  };

  const handleTaskSubmit = async (taskData: Partial<Task>) => {
    if (!user) return;

    // Safe date handling
    let safeDueAt = taskData.due_at;
    if (safeDueAt) {
      const d = new Date(safeDueAt);
      if (isNaN(d.getTime())) safeDueAt = null;
    }

    if (editingTask) {
      const sanitizedDetails = taskData.details ? sanitizeDetails(taskData.details) : undefined;
      const updated = { 
        ...editingTask, 
        ...taskData,
        details: sanitizedDetails !== undefined ? sanitizedDetails : editingTask.details,
        due_at: safeDueAt || null,
        updated_at: new Date().toISOString() 
      };
      await queueMutation('update_task', updated, user.id);
    } else {
      const sanitizedDetails = sanitizeDetails(taskData.details);
      const newTask: Task = {
        id: uuid(),
        user_id: user.id,
        subject_id: subject.id,
        type: (taskData.type || 'homework') as any,
        title: (taskData.title || '').trim(),
        details: sanitizedDetails,
        due_at: safeDueAt || null,
        remind_at: taskData.remind_at || null,
        is_done: taskData.is_done || false,
        is_important: taskData.is_important || false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await queueMutation('create_task', newTask, user.id);
    }
  };

  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAddTitle.trim() || !user || !subject) return;
    
    setIsSaving(true);
    try {
      let remindAt = null;
      let validDueAt = null;

      // Validate date
      if (quickAddDate) {
        const due = new Date(quickAddDate);
        if (!isNaN(due.getTime())) {
          validDueAt = quickAddDate;
          // Default remind 2 hours before
          due.setHours(due.getHours() - 2);
          const tzOffset = due.getTimezoneOffset() * 60000;
          try {
            remindAt = (new Date(due.getTime() - tzOffset)).toISOString().slice(0, 16);
          } catch (e) {
            console.warn('Failed to calculate remindAt', e);
            remindAt = null;
          }
        }
      }

      const safeType = ['prep', 'homework', 'project'].includes(quickAddType) ? quickAddType : 'homework';

      const newTask: Task = {
        id: uuid(),
        user_id: user.id,
        subject_id: subject.id,
        type: safeType,
        title: (quickAddTitle || '').trim(),
        details: '',
        due_at: validDueAt,
        remind_at: remindAt,
        is_done: false,
        is_important: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await queueMutation('create_task', newTask, user.id);
      
      setIsQuickAddOpen(false);
      setQuickAddTitle('');
      setQuickAddDate('');
      
      // Show toast
      const toast = document.createElement('div');
      toast.className = 'fixed bottom-4 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-4 py-2 rounded-full shadow-lg z-[100] text-sm font-medium animate-in fade-in slide-in-from-bottom-4';
      toast.textContent = 'تمت إضافة المهمة بنجاح';
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.classList.add('animate-out', 'fade-out', 'slide-out-to-bottom-4');
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    } catch (error) {
      console.error('Failed to quick add task:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const filterLabels = {
    prep: 'تحاضير',
    homework: 'واجبات',
    project: 'مشاريع',
    all: 'الكل'
  };

  const singularLabels = {
    prep: 'تحضير',
    homework: 'واجب',
    project: 'مشروع',
    all: 'مهمة'
  };

  return (
    <AnimatePresence>
      {isOpen && subject && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
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
            className="relative bg-[var(--bg)] rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-[var(--border)] theme-transition" 
            dir="rtl"
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-[var(--card)]">
              <div className="flex items-center gap-3">
                <div
                  className="h-4 w-4 rounded-full"
                  style={{ backgroundColor: subject.color }}
                />
                <div className="flex flex-col">
                  <h3 className="text-lg font-bold text-[var(--text)]">
                    {filter === 'all' ? 'مهام' : filterLabels[filter]} مادة: {subject.name}
                  </h3>
                  <span className="text-[10px] text-[var(--muted)]">items loaded: {tasks.length}</span>
                </div>
              </div>
              <button onClick={onClose} className="p-2 rounded-lg text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--text)] transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 bg-[var(--card)] border-b border-[var(--border)] flex items-center justify-between gap-4 overflow-x-auto hide-scrollbar">
              <div className="flex gap-2">
                {(['prep', 'homework', 'project', 'all'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${filter === f ? 'bg-[var(--primary)]/10 text-[var(--primary)]' : 'bg-[var(--bg)] text-[var(--muted)] hover:bg-[var(--border)]'}`}
                  >
                    {filterLabels[f]}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleOpenQuickAdd}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--border)] transition-colors"
                >
                  <Zap className="h-4 w-4" />
                  <span className="hidden sm:inline">إضافة سريعة</span>
                </button>
                <button
                  onClick={() => {
                    setEditingTask(undefined);
                    setIsTaskDialogOpen(true);
                  }}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)] transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">إضافة {singularLabels[filter]}</span>
                </button>
              </div>
            </div>

            {isQuickAddOpen && (
              <div className="bg-[var(--surface)] border-b border-[var(--border)] p-4 animate-in slide-in-from-top-2">
                <form onSubmit={handleQuickAddSubmit} className="flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={quickAddTitle}
                      onChange={(e) => setQuickAddTitle(e.target.value)}
                      placeholder="عنوان المهمة..."
                      required
                      disabled={isSaving}
                      className="flex-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] bg-[var(--card)]"
                    />
                    <select
                      value={quickAddType}
                      onChange={(e) => setQuickAddType(e.target.value as any)}
                      disabled={isSaving}
                      className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] bg-[var(--input-bg)] text-[var(--input-text)]"
                    >
                      <option value="prep">تحضير</option>
                      <option value="homework">واجب</option>
                      <option value="project">مشروع</option>
                    </select>
                    <button
                      type="submit"
                      disabled={isSaving || !quickAddTitle.trim()}
                      className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary)]/90 disabled:opacity-50 flex items-center justify-center min-w-[80px]"
                    >
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'حفظ'}
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs text-[var(--text)] bg-[var(--surface)] rounded-lg p-2 border border-[var(--border)]">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{nextLectureDisplay}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsManualDate(!isManualDate)}
                      className="underline hover:text-[var(--text)]"
                    >
                      {isManualDate ? 'إخفاء التعديل' : 'تغيير'}
                    </button>
                  </div>

                  {isManualDate && (
                    <div className="animate-in slide-in-from-top-1">
                      <input
                        type="datetime-local"
                        value={quickAddDate}
                        onChange={(e) => setQuickAddDate(e.target.value)}
                        disabled={isSaving}
                        className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] bg-[var(--input-bg)] text-[var(--input-text)]"
                        dir="ltr"
                      />
                    </div>
                  )}
                </form>
              </div>
            )}

            <ErrorBoundary>
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                {sortedTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] py-12 text-center">
                    <p className="text-sm text-[var(--muted)]">لا توجد {filterLabels[filter]} لهذه المادة.</p>
                  </div>
                ) : (
                  sortedTasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      subject={subject}
                      onToggleDone={handleToggleDone}
                      onToggleImportant={handleToggleImportant}
                      onDelete={handleDeleteTask}
                      onEdit={(t) => {
                        setEditingTask(t);
                        setIsTaskDialogOpen(true);
                      }}
                    />
                  ))
                )}
              </div>
            </ErrorBoundary>
          </motion.div>

          <TaskDialog
            isOpen={isTaskDialogOpen}
            onClose={() => setIsTaskDialogOpen(false)}
            onSubmit={handleTaskSubmit}
            initialData={editingTask}
            subjects={subjects}
            lockedSubjectId={subject.id}
            defaultType={filter !== 'all' ? filter : 'homework'}
          />
        </div>
      )}
    </AnimatePresence>
  );
}
