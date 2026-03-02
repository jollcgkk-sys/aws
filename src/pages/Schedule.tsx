import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, WeeklySchedule, Subject, Task } from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import { queueMutation } from '../lib/sync';
import { uuid } from '../lib/uuid';
import { WEEK_DAYS_UI_ORDER } from '../lib/weekDays';
import { Plus, Trash2, Zap, RefreshCw } from 'lucide-react';
import SyncBadge from '../components/SyncBadge';
import QuickAddDialog from '../components/QuickAddDialog';
import SubjectTasksDialog from '../components/SubjectTasksDialog';
import { ensureAppDataLoaded } from '../lib/appDataLoader';

export default function Schedule() {
  const { user } = useAuth();
  const schedule = useLiveQuery(() => db.weekly_schedule.where('user_id').equals(user?.id || '').toArray(), [user?.id]) || [];
  const subjects = useLiveQuery(() => db.subjects.where('user_id').equals(user?.id || '').toArray(), [user?.id]) || [];
  const slotTimes = useLiveQuery(() => db.slot_times.where('user_id').equals(user?.id || '').toArray(), [user?.id]) || [];

  console.log('[Schedule] user.id:', user?.id);
  console.log('[Schedule] schedule count:', schedule.length);
  console.log('[Schedule] subjects count:', subjects.length);

  const [selectedSubjectMap, setSelectedSubjectMap] = useState<Record<number, string>>({});
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [selectedSubjectForTasks, setSelectedSubjectForTasks] = useState<Subject | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (user && schedule.length === 0) {
      ensureAppDataLoaded(user.id);
    }
  }, [user, schedule.length]);

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

  const handleAddSlot = async (dayOfWeek: number) => {
    const selectedSubject = selectedSubjectMap[dayOfWeek];
    if (!user || !selectedSubject) return;
    const daySchedule = schedule.filter(s => s.day_of_week === dayOfWeek);
    const nextSlot = daySchedule.length > 0 ? Math.max(...daySchedule.map(s => s.slot)) + 1 : 1;

    const defaultSlotTime = slotTimes.find(st => st.slot === nextSlot)?.start_time || '08:30';

    const newSlot: WeeklySchedule = {
      id: uuid(),
      user_id: user.id,
      day_of_week: dayOfWeek,
      slot: nextSlot,
      subject_id: selectedSubject,
      start_time: defaultSlotTime,
    };

    await queueMutation('update_schedule', newSlot, user.id);
    setSelectedSubjectMap(prev => ({ ...prev, [dayOfWeek]: '' }));
  };

  const handleDeleteSlot = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    await queueMutation('delete_schedule', { id }, user.id);
  };

  const handleTimeChange = async (slot: WeeklySchedule, field: 'start_time' | 'end_time', value: string, e: React.ChangeEvent) => {
    e.stopPropagation();
    if (!user) return;
    const updatedSlot = { ...slot, [field]: value };
    await queueMutation('update_schedule', updatedSlot, user.id);
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-[var(--text)]">الجدول الأسبوعي</h2>
        <div className="flex gap-2">
          <button
            onClick={handleForceRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface)] transition-colors disabled:opacity-50"
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
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {WEEK_DAYS_UI_ORDER.map(day => {
          const daySlots = schedule.filter(s => Number(s.day_of_week) === Number(day.id)).sort((a, b) => {
            if (a.start_time && b.start_time) {
              return a.start_time.localeCompare(b.start_time);
            }
            return a.slot - b.slot;
          });
          
          console.log(`[Schedule] Day ${day.label} (id=${day.id}): ${daySlots.length} slots`);
          
          return (
            <div key={day.id} className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
              <h3 className="font-semibold text-[var(--text)] border-b border-[var(--border)] pb-2">{day.label}</h3>
              
              {/* DEBUG: Prove map execution */}
              {/* {daySlots.length > 0 && (
                <div className="text-[10px] text-red-500 bg-red-50 p-1 mb-2 border border-red-200" dir="ltr">
                  DEBUG: {daySlots.length} slots found. IDs: {daySlots.map(s => s.id.slice(0,4)).join(', ')}
                </div>
              )} */}

              <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto">
                {daySlots.map(slot => {
                  const subject = subjects.find(s => s.id === slot.subject_id);
                  console.log(`[Schedule] Rendering slot ${slot.id} for subject ${subject?.name}`);
                  return (
                    <div 
                      key={slot.id} 
                      onClick={() => subject && setSelectedSubjectForTasks(subject)}
                      className="flex flex-col gap-2 rounded-lg bg-[var(--surface)] p-3 border border-[var(--border)] cursor-pointer hover:bg-[var(--surface)] transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: subject?.color || '#ccc' }}
                          />
                          <span className="text-sm font-medium text-[var(--text)]">{subject?.name || 'مادة محذوفة'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <SyncBadge status={slot.sync_status} />
                          <button
                            onClick={(e) => handleDeleteSlot(slot.id, e)}
                            className="text-[var(--muted)] hover:text-red-600 p-1"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 mt-1" onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs text-[var(--muted)]">من:</span>
                        <input
                          type="time"
                          value={slot.start_time || ''}
                          onChange={(e) => handleTimeChange(slot, 'start_time', e.target.value, e)}
                          className="rounded-md border border-[var(--border)] px-2 py-1 text-xs focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] bg-[var(--input-bg)] text-[var(--input-text)]"
                        />
                        <span className="text-xs text-[var(--muted)]">إلى:</span>
                        <input
                          type="time"
                          value={slot.end_time || ''}
                          onChange={(e) => handleTimeChange(slot, 'end_time', e.target.value, e)}
                          className="rounded-md border border-[var(--border)] px-2 py-1 text-xs focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-[var(--input-bg)] text-[var(--input-text)]"
                        />
                      </div>
                    </div>
                  );
                })}
                {daySlots.length === 0 && (
                  <p className="text-xs text-[var(--muted)] text-center py-4">لا توجد مواد مضافة</p>
                )}
              </div>

              <div className="flex gap-2 mt-auto pt-4 border-t border-[var(--border)]">
                <select
                  value={selectedSubjectMap[day.id] || ''}
                  onChange={(e) => setSelectedSubjectMap(prev => ({ ...prev, [day.id]: e.target.value }))}
                  className="flex-1 rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-[var(--input-bg)] text-[var(--input-text)]"
                >
                  <option value="">اختر مادة...</option>
                  {subjects.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => handleAddSlot(day.id)}
                  disabled={!selectedSubjectMap[day.id]}
                  className="flex items-center justify-center rounded-lg bg-[var(--primary)] px-3 py-1.5 text-white hover:bg-[var(--primary)]/90 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <QuickAddDialog
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onSubmit={handleTaskSubmit}
        subjects={subjects}
        schedule={schedule}
        slotTimes={slotTimes}
      />

      <SubjectTasksDialog
        isOpen={!!selectedSubjectForTasks}
        onClose={() => setSelectedSubjectForTasks(null)}
        subject={selectedSubjectForTasks}
        subjects={subjects}
      />
    </div>
  );
}
