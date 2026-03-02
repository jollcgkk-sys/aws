import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Task } from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import { queueMutation } from '../lib/sync';
import { uuid } from '../lib/uuid';
import { ArrowRight, Plus, Zap } from 'lucide-react';
import TaskCard from '../components/TaskCard';
import TaskDialog from '../components/TaskDialog';
import QuickAddDialog from '../components/QuickAddDialog';

export default function SubjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const subject = useLiveQuery(() => db.subjects.get(id || ''), [id]);
  const tasks = useLiveQuery(() => 
    db.tasks.where('subject_id').equals(id || '').toArray(), 
    [id]
  ) || [];
  const subjects = useLiveQuery(() => db.subjects.where('user_id').equals(user?.id || '').toArray(), [user?.id]) || [];
  const schedule = useLiveQuery(() => db.weekly_schedule.where('user_id').equals(user?.id || '').toArray(), [user?.id]) || [];
  const slotTimes = useLiveQuery(() => db.slot_times.where('user_id').equals(user?.id || '').toArray(), [user?.id]) || [];

  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>(undefined);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

  if (!subject) {
    return <div className="p-6 text-center text-[var(--muted)]">جاري التحميل أو المادة غير موجودة...</div>;
  }

  const handleTaskSubmit = async (taskData: Partial<Task>) => {
    if (!user) return;

    if (editingTask) {
      const updated = { ...editingTask, ...taskData, updated_at: new Date().toISOString() };
      await queueMutation('update_task', updated, user.id);
    } else {
      const newTask: Task = {
        id: uuid(),
        user_id: user.id,
        subject_id: subject.id,
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

  const handleToggleDone = async (taskId: string, isDone: boolean) => {
    if (!user) return;
    const task = await db.tasks.get(taskId);
    if (task) {
      await queueMutation('update_task', { ...task, is_done: isDone, updated_at: new Date().toISOString() }, user.id);
    }
  };

  const handleToggleImportant = async (taskId: string, isImportant: boolean) => {
    if (!user) return;
    const task = await db.tasks.get(taskId);
    if (task) {
      await queueMutation('update_task', { ...task, is_important: isImportant, updated_at: new Date().toISOString() }, user.id);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!user) return;
    await queueMutation('delete_task', { id: taskId }, user.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/subjects')}
          className="rounded-full p-2 text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
        >
          <ArrowRight className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-3">
          <div
            className="h-5 w-5 rounded-full"
            style={{ backgroundColor: subject.color }}
          />
          <h2 className="text-2xl font-bold text-[var(--text)]">{subject.name}</h2>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[var(--text)]">مهام المادة</h3>
        <div className="flex gap-2">
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
            className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary)]/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">إضافة مهمة</span>
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] py-12 text-center">
            <p className="text-sm text-[var(--text-secondary)]">لا توجد مهام لهذه المادة.</p>
          </div>
        ) : (
          tasks.map(task => (
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

      <TaskDialog
        isOpen={isTaskDialogOpen}
        onClose={() => setIsTaskDialogOpen(false)}
        onSubmit={handleTaskSubmit}
        initialData={editingTask}
        subjects={subjects}
        lockedSubjectId={subject.id}
      />

      <QuickAddDialog
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onSubmit={handleTaskSubmit}
        subjects={subjects}
        schedule={schedule}
        slotTimes={slotTimes}
        defaultSubjectId={subject.id}
      />
    </div>
  );
}
