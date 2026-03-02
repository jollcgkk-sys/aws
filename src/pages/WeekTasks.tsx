import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Task, Subject } from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import { queueMutation } from '../lib/sync';
import { uuid } from '../lib/uuid';
import { WEEK_DAYS_UI_ORDER } from '../lib/weekDays';
import TaskCard from '../components/TaskCard';
import TaskDialog from '../components/TaskDialog';
import QuickAddDialog from '../components/QuickAddDialog';
import { format, addDays, startOfWeek, getISODay } from 'date-fns';
import { Zap, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { pageTransition, listStagger, cardIn } from '../lib/motion';
import { ensureAppDataLoaded } from '../lib/appDataLoader';

export default function WeekTasks() {
  const { user } = useAuth();
  const today = new Date();
  // Mon=0, Sun=6
  const currentDayOfWeek = getISODay(today) - 1; 
  const [activeDay, setActiveDay] = useState<number>(currentDayOfWeek);

  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>(undefined);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const tasks = useLiveQuery(() => db.tasks.where('user_id').equals(user?.id || '').toArray(), [user?.id]) || [];
  const subjects = useLiveQuery(() => db.subjects.where('user_id').equals(user?.id || '').toArray(), [user?.id]) || [];
  const schedule = useLiveQuery(() => db.weekly_schedule.where('user_id').equals(user?.id || '').toArray(), [user?.id]) || [];
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

  const getScheduledSubjects = (dayOfWeek: number) => {
    const filtered = schedule.filter(s => Number(s.day_of_week) === Number(dayOfWeek));
    console.log(`[WeekTasks] getScheduledSubjects(${dayOfWeek}): found ${filtered.length} slots`);
    return filtered
      .sort((a, b) => {
        if (a.start_time && b.start_time) {
          return a.start_time.localeCompare(b.start_time);
        }
        return a.slot - b.slot;
      })
      .map(s => ({ subject: subjectMap[s.subject_id], slot: s }))
      .filter(item => item.subject);
  };

  const getTasksForDay = (dayOfWeek: number) => {
    const scheduledSubjectsForDay = getScheduledSubjects(dayOfWeek).map(s => s.subject.id);
    
    // Find the actual date for this day of the current week
    const startOfCurrentWeek = startOfWeek(today, { weekStartsOn: 1 }); // 1 = Monday
    const targetDate = addDays(startOfCurrentWeek, dayOfWeek);
    const targetDateString = format(targetDate, 'yyyy-MM-dd');

    const filtered = tasks.filter(t => {
      // 1. Tasks where subject_id is in scheduled subjects AND is_done=false
      const isScheduledSubjectTask = t.subject_id && scheduledSubjectsForDay.includes(t.subject_id) && !t.is_done;
      
      // 2. Tasks whose due_at falls on that day
      const isDueOnDay = t.due_at && t.due_at.startsWith(targetDateString);

      return isScheduledSubjectTask || isDueOnDay;
    });

    // Sort: overdue first, then nearest due_at, done last
    return filtered.sort((a, b) => {
      if (a.is_done !== b.is_done) return a.is_done ? 1 : -1;
      
      const now = new Date().getTime();
      const aTime = a.due_at ? new Date(a.due_at).getTime() : Infinity;
      const bTime = b.due_at ? new Date(b.due_at).getTime() : Infinity;
      
      const aOverdue = aTime < now;
      const bOverdue = bTime < now;

      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;

      return aTime - bTime;
    });
  };

  const scheduledSubjects = getScheduledSubjects(activeDay);
  const displayedTasks = getTasksForDay(activeDay);

  // Debugging Sunday issue
  console.log('[TABS ORDER]', WEEK_DAYS_UI_ORDER.map(d => d.label));
  console.log('[STATE] activeDay=', activeDay);
  console.log('[DATA] subjects=', subjects.length, 'schedule=', schedule.length, 'tasks=', tasks.length);
  const scheduleMatches = schedule.filter(s => Number(s.day_of_week) === Number(activeDay));
  console.log('[MATCH] scheduleMatches=', scheduleMatches.length);
  console.log('[TASK SAMPLE]', displayedTasks.slice(0,3).map(t=>({id:t.id,type:t.type,due_at:t.due_at,title:t.title,detailsLen:(t.details||'').length})));
  
  const startDebug = startOfWeek(today, { weekStartsOn: 1 });
  const activeDateDebug = addDays(startDebug, activeDay);
  console.log('[DATES] startOfWeek=', startDebug.toISOString(), 'activeDate=', activeDateDebug.toISOString());

  // Calculate default date for new tasks based on active tab
  const startOfCurrentWeek = startOfWeek(today, { weekStartsOn: 1 });
  const activeDate = addDays(startOfCurrentWeek, activeDay);
  const defaultDateForNewTask = format(activeDate, 'yyyy-MM-dd');

  return (
    <motion.div 
      variants={pageTransition}
      initial="initial"
      animate="animate"
      exit="exit"
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-[var(--text)]">مهام الأسبوع</h2>
        <button
          onClick={() => setIsQuickAddOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-200 transition-colors"
        >
          <Zap className="h-4 w-4" />
          <span className="hidden sm:inline">إضافة سريعة</span>
        </button>
      </div>

      <div 
        dir="rtl" 
        className="w-full overflow-x-auto border-b border-[var(--border)] pb-2 hide-scrollbar"
      >
        {/* Inner wrapper for RTL alignment */}
        <div 
          dir="ltr" 
          className="flex flex-row-reverse min-w-full justify-start gap-2 px-1"
        >
          {WEEK_DAYS_UI_ORDER.map(day => (
            <button
              key={day.id}
              onClick={() => {
                console.log('[CLICK TAB]', day.label, 'id=', day.id);
                setActiveDay(day.id);
              }}
              className={`whitespace-nowrap px-4 py-2 text-sm font-medium rounded-t-lg transition-colors shrink-0 ${activeDay === day.id ? 'bg-[var(--primary)]/10 text-[var(--primary)] border-b-2 border-[var(--primary)]' : 'text-[var(--muted)] hover:bg-[var(--bg)]'}`}
            >
              {day.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
          <h3 className="text-lg font-semibold text-[var(--text)]">المهام</h3>
          {displayedTasks.length === 0 ? (
            <motion.div 
              variants={cardIn}
              initial="initial"
              animate="animate"
              className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] py-12 text-center"
            >
              <p className="text-sm text-[var(--muted)]">لا توجد مهام لهذا اليوم.</p>
            </motion.div>
          ) : (
            <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">
              {displayedTasks.map(task => (
                <div key={task.id}>
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
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-[var(--text)]">المواد المجدولة</h3>
          <motion.div 
            variants={cardIn}
            initial="initial"
            animate="animate"
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm theme-transition flex flex-col max-h-[500px]"
          >
            {scheduledSubjects.length === 0 ? (
              <p className="text-sm text-[var(--muted)] text-center py-4">لا توجد مواد مجدولة لهذا اليوم.</p>
            ) : (
              <div className="space-y-3 flex-1 min-h-0 overflow-y-auto">
                {scheduledSubjects.map((item, idx) => {
                  const subject = item.subject || { id: 'deleted', name: 'Deleted Subject', color: '#ccc' };
                  return (
                  <div key={`${subject.id || 'del'}-${idx}`} className="flex items-center justify-between rounded-lg bg-[var(--bg)] p-3 border border-[var(--border)] shrink-0">
                    <div className="flex items-center gap-3">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: subject.color }}
                      />
                      <span className="font-medium text-[var(--text)]">{subject.name}</span>
                    </div>
                    {item.slot.start_time && (
                      <span className="text-xs text-[var(--muted)] font-medium bg-[var(--card)] px-2 py-1 rounded-md border border-[var(--border)]">
                        {item.slot.start_time} {item.slot.end_time ? `- ${item.slot.end_time}` : ''}
                      </span>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        </div>
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
    </motion.div>
  );
}
