import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Task, Subject, DayNote } from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import { queueMutation } from '../lib/sync';
import { uuid } from '../lib/uuid';
import TaskCard from '../components/TaskCard';
import TaskDialog from '../components/TaskDialog';
import DayNoteDialog from '../components/DayNoteDialog';
import QuickAddDialog from '../components/QuickAddDialog';
import { format, addDays, startOfDay, endOfDay, getISODay } from 'date-fns';
import { Plus, Bell, Zap, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { pageTransition, listStagger, cardIn } from '../lib/motion';
import { ensureAppDataLoaded } from '../lib/appDataLoader';

export default function Dashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'today' | 'tomorrow' | 'important'>('today');
  const [taskFilter, setTaskFilter] = useState<'all' | 'incomplete' | 'completed'>('incomplete');

  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>(undefined);

  const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<DayNote | undefined>(undefined);

  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const today = new Date();
  const tomorrow = addDays(today, 1);

  const tasks = useLiveQuery(() => db.tasks.where('user_id').equals(user?.id || '').toArray(), [user?.id]) || [];
  const subjects = useLiveQuery(() => db.subjects.where('user_id').equals(user?.id || '').toArray(), [user?.id]) || [];
  const schedule = useLiveQuery(() => db.weekly_schedule.where('user_id').equals(user?.id || '').toArray(), [user?.id]) || [];
  const notes = useLiveQuery(() => db.day_notes.where('user_id').equals(user?.id || '').toArray(), [user?.id]) || [];
  const slotTimes = useLiveQuery(() => db.slot_times.where('user_id').equals(user?.id || '').toArray(), [user?.id]) || [];

  useEffect(() => {
    if (user && tasks.length === 0 && subjects.length === 0) {
      ensureAppDataLoaded(user.id);
    }
  }, [user, tasks.length, subjects.length]);

  const handleForceRefresh = async () => {
    if (!user) return;
    setIsRefreshing(true);
    try {
      await ensureAppDataLoaded(user.id, { force: true });
    } catch (error) {
      console.error('Error during force refresh:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const subjectMap = subjects.reduce((acc, sub) => {
    acc[sub.id] = sub;
    return acc;
  }, {} as Record<string, Subject>);

  const handleToggleDone = async (id: string, isDone: boolean) => {
    if (!user) return;
    const task = await db.tasks.get(id);
    if (task) {
      const updated = { ...task, is_done: isDone, updated_at: new Date().toISOString() };
      await queueMutation('update_task', updated, user.id);
    }
  };

  const handleToggleImportant = async (id: string, isImportant: boolean) => {
    if (!user) return;
    const task = await db.tasks.get(id);
    if (task) {
      const updated = { ...task, is_important: isImportant, updated_at: new Date().toISOString() };
      await queueMutation('update_task', updated, user.id);
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!user) return;
    await queueMutation('delete_task', { id }, user.id);
  };

  const handleTaskSubmit = async (taskData: Partial<Task>) => {
    if (!user) return;
    
    console.log('[SAVE TASK PAYLOAD]', taskData);
    console.log('[DETAILS]', taskData.details?.length, JSON.stringify(taskData.details?.slice(0,50)));

    if (editingTask) {
      const updated = { ...editingTask, ...taskData, updated_at: new Date().toISOString() };
      await queueMutation('update_task', updated, user.id);
    } else {
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
    }
  };

  const handleNoteSubmit = async (noteData: Partial<DayNote>) => {
    if (!user) return;

    if (editingNote) {
      const updated = { ...editingNote, ...noteData, updated_at: new Date().toISOString() };
      await queueMutation('update_day_note', updated, user.id);
    } else {
      const newNote: DayNote = {
        id: uuid(),
        user_id: user.id,
        title: noteData.title || null,
        content: noteData.content || '',
        note_date: noteData.note_date || null,
        day_of_week: noteData.day_of_week !== undefined ? noteData.day_of_week : null,
        remind_at: noteData.remind_at || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await queueMutation('create_day_note', newNote, user.id);
    }
  };

  const handleDeleteNote = async (id: string) => {
    if (!user) return;
    await queueMutation('delete_day_note', { id }, user.id);
  };

  const getFilteredTasks = () => {
    let filtered = tasks;
    const now = new Date().getTime();

    if (activeTab === 'today') {
      filtered = tasks.filter(t => {
        if (!t.due_at) return true; // Include tasks without due_at
        const dueTime = new Date(t.due_at).getTime();
        const isOverdue = dueTime < startOfDay(today).getTime() && !t.is_done;
        const isToday = dueTime >= startOfDay(today).getTime() && dueTime <= endOfDay(today).getTime();
        return isOverdue || isToday;
      });
    } else if (activeTab === 'tomorrow') {
      filtered = tasks.filter(t => {
        if (!t.due_at) return true;
        const dueTime = new Date(t.due_at).getTime();
        const isOverdue = dueTime < startOfDay(tomorrow).getTime() && !t.is_done;
        const isTomorrow = dueTime >= startOfDay(tomorrow).getTime() && dueTime <= endOfDay(tomorrow).getTime();
        return isOverdue || isTomorrow;
      });
    } else if (activeTab === 'important') {
      filtered = tasks.filter(t => t.is_important || t.type === 'project');
    }

    if (taskFilter === 'incomplete') {
      filtered = filtered.filter(t => !t.is_done);
    } else if (taskFilter === 'completed') {
      filtered = filtered.filter(t => t.is_done);
    }

    // Sort: overdue first, then nearest due_at, done last
    return filtered.sort((a, b) => {
      if (a.is_done !== b.is_done) return a.is_done ? 1 : -1;
      
      const aTime = a.due_at ? new Date(a.due_at).getTime() : Infinity;
      const bTime = b.due_at ? new Date(b.due_at).getTime() : Infinity;
      
      const aOverdue = aTime < now;
      const bOverdue = bTime < now;

      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;

      return aTime - bTime;
    });
  };

  const getFilteredNotes = () => {
    if (activeTab === 'today') {
      return notes.filter(n => n.note_date && new Date(n.note_date) >= startOfDay(today) && new Date(n.note_date) <= endOfDay(today));
    } else if (activeTab === 'tomorrow') {
      return notes.filter(n => n.note_date && new Date(n.note_date) >= startOfDay(tomorrow) && new Date(n.note_date) <= endOfDay(tomorrow));
    }
    return [];
  };

  const getScheduledSubjects = () => {
    let targetDay = getISODay(today) - 1;
    if (activeTab === 'tomorrow') {
      targetDay = getISODay(tomorrow) - 1;
    } else if (activeTab === 'important') {
      return []; // Don't show schedule on important tab
    }

    return schedule
      .filter(s => s.day_of_week === targetDay)
      .sort((a, b) => a.slot - b.slot)
      .map(s => subjectMap[s.subject_id])
      .filter(Boolean);
  };

  const getUpcomingReminders = () => {
    const now = new Date().getTime();
    const next24h = now + 24 * 60 * 60 * 1000;

    const dueTasks = tasks.filter(t => !t.is_done && t.remind_at && new Date(t.remind_at).getTime() <= next24h);
    const dueNotes = notes.filter(n => n.remind_at && new Date(n.remind_at).getTime() <= next24h);

    return [...dueTasks, ...dueNotes].sort((a, b) => {
      const aTime = new Date(a.remind_at!).getTime();
      const bTime = new Date(b.remind_at!).getTime();
      return aTime - bTime;
    });
  };

  const displayedTasks = getFilteredTasks();
  const displayedNotes = getFilteredNotes();
  const scheduledSubjects = getScheduledSubjects();
  const upcomingReminders = getUpcomingReminders();

  const defaultDateForNewTask = activeTab === 'tomorrow' ? format(tomorrow, 'yyyy-MM-dd') : format(today, 'yyyy-MM-dd');

  return (
    <motion.div 
      className="space-y-6"
      initial="initial"
      animate="animate"
      exit="exit"
      variants={pageTransition}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-[var(--text)]">لوحة التحكم</h2>
        <div className="flex gap-2">
          <button
            onClick={handleForceRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--card)] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
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
              setEditingTask(undefined);
              setIsTaskDialogOpen(true);
            }}
            className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">مهمة جديدة</span>
          </button>
        </div>
      </div>

      {upcomingReminders.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 mb-3 text-amber-800">
            <Bell className="h-5 w-5" />
            <h3 className="font-semibold">تذكيرات قادمة</h3>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingReminders.map(item => {
              const isTask = 'is_done' in item;
              const title = isTask ? item.title : item.content;
              const time = new Date(item.remind_at!);
              const isOverdue = time.getTime() < new Date().getTime();
              
              return (
                <div key={item.id} className="flex items-center justify-between rounded-lg bg-[var(--card)] p-3 shadow-sm border border-amber-100">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-[var(--text)] line-clamp-1">{title}</span>
                    <span className={`text-xs ${isOverdue ? 'text-red-600 font-bold' : 'text-amber-600'}`} dir="ltr">
                      {format(time, 'MMM d, h:mm a')}
                    </span>
                  </div>
                  {isTask && (
                    <button
                      onClick={() => handleToggleDone(item.id, true)}
                      className="rounded-full h-6 w-6 border border-[var(--border)] flex items-center justify-center text-transparent hover:border-emerald-500 hover:text-emerald-500"
                    >
                      ✓
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-2">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('today')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === 'today' ? 'bg-[var(--primary)]/10 text-[var(--primary)] border-b-2 border-[var(--primary)]' : 'text-[var(--muted)] hover:bg-[var(--surface)]'}`}
            >
              اليوم
            </button>
            <button
              onClick={() => setActiveTab('tomorrow')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === 'tomorrow' ? 'bg-[var(--primary)]/10 text-[var(--primary)] border-b-2 border-[var(--primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface)]'}`}
            >
              غدًا
            </button>
            <button
              onClick={() => setActiveTab('important')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === 'important' ? 'bg-amber-50 text-amber-700 border-b-2 border-amber-600' : 'text-[var(--text-secondary)] hover:bg-[var(--surface)]'}`}
            >
              المهم ⭐
            </button>
          </div>
          
          <div className="flex items-center gap-2 border-r border-[var(--border)] pr-4">
            <span className="text-sm text-[var(--text-secondary)]">عرض:</span>
            <button
              onClick={() => setTaskFilter('incomplete')}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${taskFilter === 'incomplete' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface)] text-slate-600 hover:bg-[var(--surface)]'}`}
            >
              غير مكتمل
            </button>
            <button
              onClick={() => setTaskFilter('completed')}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${taskFilter === 'completed' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface)] text-slate-600 hover:bg-[var(--surface)]'}`}
            >
              مكتمل
            </button>
            <button
              onClick={() => setTaskFilter('all')}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${taskFilter === 'all' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface)] text-slate-600 hover:bg-[var(--border)]'}`}
            >
              الكل
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 flex flex-col gap-6 min-h-0">
          <div className="flex flex-col gap-4 min-h-0">
            <h3 className="text-lg font-semibold text-[var(--text)] shrink-0">المهام</h3>
            <div className="min-h-[240px] max-h-[600px] overflow-y-auto pr-1 flex flex-col min-h-0">
              <motion.div 
                className="space-y-4 flex-1 flex flex-col"
                variants={listStagger}
                initial="initial"
                animate="animate"
              >
                {displayedTasks.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)] flex-1 min-h-[240px] text-center"
                  >
                    <p className="text-sm text-[var(--muted)]">لا توجد مهام لعرضها هنا.</p>
                  </motion.div>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {displayedTasks.map(task => (
                      <motion.div 
                        key={task.id} 
                        variants={cardIn}
                        initial="initial"
                        animate="animate"
                        layout="position"
                        exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                      >
                        <TaskCard
                          task={task}
                          subject={task.subject_id ? subjectMap[task.subject_id] : undefined}
                          onToggleDone={handleToggleDone}
                          onToggleImportant={handleToggleImportant}
                          onDelete={handleDeleteTask}
                          onEdit={(t) => {
                            setEditingTask(t);
                            setIsTaskDialogOpen(true);
                          }}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </motion.div>
            </div>
          </div>

          {(activeTab === 'today' || activeTab === 'tomorrow') && (
            <div className="flex flex-col gap-4 shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[var(--text)]">ملاحظات اليوم</h3>
                <button
                  onClick={() => {
                    setEditingNote(undefined);
                    setIsNoteDialogOpen(true);
                  }}
                  className="rounded-full p-1 text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--primary)]"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
              
              {displayedNotes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-center">
                  <p className="text-sm text-[var(--muted)]">لا توجد ملاحظات.</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {displayedNotes.map(note => (
                    <div key={note.id} className="group relative rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                      {note.title && <h4 className="font-semibold text-[var(--text)] mb-1">{note.title}</h4>}
                      <p className="text-sm text-[var(--text)] whitespace-pre-wrap">{note.content}</p>
                      {note.remind_at && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                          <Bell className="h-3 w-3" />
                          <span dir="ltr">{format(new Date(note.remind_at), 'h:mm a')}</span>
                        </div>
                      )}
                      <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <button
                          onClick={() => {
                            setEditingNote(note);
                            setIsNoteDialogOpen(true);
                          }}
                          className="rounded p-1 text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--primary)]"
                        >
                          تعديل
                        </button>
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="rounded p-1 text-[var(--muted)] hover:bg-[var(--surface)] hover:text-red-600"
                        >
                          حذف
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {(activeTab === 'today' || activeTab === 'tomorrow') && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-[var(--text)]">الجدول الدراسي</h3>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
              {scheduledSubjects.length === 0 ? (
                <p className="text-sm text-[var(--muted)] text-center py-4">لا توجد مواد مجدولة لهذا اليوم.</p>
              ) : (
                <div className="space-y-3">
                  {scheduledSubjects.map((sub, idx) => (
                    <div key={`${sub.id}-${idx}`} className="flex items-center gap-3 rounded-lg bg-[var(--surface)] p-3 border border-[var(--border)]">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: sub.color }}
                      />
                      <span className="font-medium text-[var(--text)]">{sub.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <TaskDialog
        isOpen={isTaskDialogOpen}
        onClose={() => setIsTaskDialogOpen(false)}
        onSubmit={handleTaskSubmit}
        initialData={editingTask}
        subjects={subjects}
        defaultDate={defaultDateForNewTask}
      />

      <QuickAddDialog
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onSubmit={handleTaskSubmit}
        subjects={subjects}
        schedule={schedule}
        slotTimes={slotTimes}
      />

      <DayNoteDialog
        isOpen={isNoteDialogOpen}
        onClose={() => setIsNoteDialogOpen(false)}
        onSubmit={handleNoteSubmit}
        initialData={editingNote}
        defaultDate={defaultDateForNewTask}
      />
    </motion.div>
  );
}
