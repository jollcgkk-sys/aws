import { Outlet, NavLink } from 'react-router-dom';
import { useSync } from '../contexts/SyncContext';
import { Home, Calendar, BookOpen, Search, Settings, WifiOff, RefreshCw, ListTodo, Bell, Zap } from 'lucide-react';
import { cn } from '../lib/utils';
import { useEffect, useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Task } from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import QuickAddDialog from './QuickAddDialog';
import { queueMutation } from '../lib/sync';
import { uuid } from '../lib/uuid';
import { DebugPanel } from './DebugPanel';

export default function Layout() {
  const { isOnline, pendingCount, failedCount, triggerSync, isSyncing, lastSyncError, rawLastError, clearFailedMutations } = useSync();
  const { user } = useAuth();
  const [toast, setToast] = useState<{ id: string, message: string, isError?: boolean } | null>(null);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  
  // Use a ref to track notified reminders without triggering effect re-runs
  const notifiedIdsRef = useRef<Set<string>>(new Set());

  // Initialize from localStorage once on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('notifiedReminders');
      if (stored) {
        notifiedIdsRef.current = new Set(JSON.parse(stored));
      }
    } catch (e) {
      // Ignore parse errors
    }
  }, []);

  const navItems = [
    { to: '/dashboard', icon: Home, label: 'الرئيسية' },
    { to: '/week-tasks', icon: ListTodo, label: 'مهام الأسبوع' },
    { to: '/schedule', icon: Calendar, label: 'الجدول' },
    { to: '/subjects', icon: BookOpen, label: 'المواد' },
    { to: '/ask', icon: Search, label: 'اسأل' },
    { to: '/settings', icon: Settings, label: 'الإعدادات' },
  ];

  const tasks = useLiveQuery(() => db.tasks.where('user_id').equals(user?.id || '').toArray(), [user?.id]) || [];
  const notes = useLiveQuery(() => db.day_notes.where('user_id').equals(user?.id || '').toArray(), [user?.id]) || [];
  const subjects = useLiveQuery(() => db.subjects.where('user_id').equals(user?.id || '').toArray(), [user?.id]) || [];
  const schedule = useLiveQuery(() => db.weekly_schedule.where('user_id').equals(user?.id || '').toArray(), [user?.id]) || [];
  const slotTimes = useLiveQuery(() => db.slot_times.where('user_id').equals(user?.id || '').toArray(), [user?.id]) || [];

  useEffect(() => {
    if (lastSyncError) {
      setToast({ id: 'sync-error', message: `خطأ في المزامنة: ${lastSyncError}`, isError: true });
      setTimeout(() => setToast(null), 5000);
    }
  }, [lastSyncError]);

  useEffect(() => {
    if (!user) return;

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const checkReminders = () => {
      const now = new Date().getTime();
      
      const dueTasks = tasks.filter(t => !t.is_done && t.remind_at && new Date(t.remind_at).getTime() <= now);
      const dueNotes = notes.filter(n => n.remind_at && new Date(n.remind_at).getTime() <= now);

      const allDue = [...dueTasks, ...dueNotes];

      for (const item of allDue) {
        if (!notifiedIdsRef.current.has(item.id)) {
          const title = 'title' in item ? item.title : item.content;
          const message = `تذكير: ${title}`;
          
          setToast({ id: item.id, message, isError: false });
          
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('مخطط الدراسة', { body: message });
          }

          // Add to ref and persist to localStorage
          notifiedIdsRef.current.add(item.id);
          try {
            localStorage.setItem('notifiedReminders', JSON.stringify(Array.from(notifiedIdsRef.current)));
          } catch (e) {
            // Ignore quota errors
          }
          
          // Clear toast after 5s
          setTimeout(() => setToast(null), 5000);
          break; // Only show one toast at a time
        }
      }
    };

    const interval = setInterval(checkReminders, 60000); // Check every minute
    checkReminders(); // Check immediately on mount

    return () => clearInterval(interval);
  }, [tasks, notes, user]);

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
    <div className="flex h-screen flex-col bg-transparent md:flex-row theme-transition">
      <div className="theme-bg-overlay"></div>
      
      {/* Sidebar for Desktop */}
      <aside className="hidden w-64 flex-col border-l border-[var(--border)] bg-[var(--card)] md:flex theme-transition">
        <div className="flex h-16 items-center justify-center border-b border-[var(--border)] px-4">
          <h1 className="text-xl font-bold text-[var(--primary)]">مخطط الدراسة</h1>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-[var(--primary)] text-white'
                    : 'text-[var(--text)] opacity-80 hover:bg-[var(--bg)] hover:opacity-100'
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden relative">
        {/* Toast Notification */}
        {toast && (
          <div className={cn(
            "absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl px-4 py-3 text-white shadow-lg animate-in slide-in-from-top-4 fade-in duration-300",
            toast.isError ? "bg-red-600" : "bg-[var(--primary)]"
          )}>
            <Bell className="h-5 w-5 animate-bounce" />
            <span className="font-medium text-sm">{toast.message}</span>
          </div>
        )}

        {/* Offline Banner & Sync Status */}
        <header className="flex flex-col border-b border-[var(--border)] bg-[var(--card)] theme-transition">
          {!isOnline && (
            <div className="flex items-center justify-center gap-2 bg-red-50 py-1.5 text-xs font-medium text-red-600">
              <WifiOff className="h-4 w-4" />
              أنت غير متصل بالإنترنت
            </div>
          )}
          <div className="flex h-14 items-center justify-between px-4 md:px-6">
            <div className="md:hidden">
              <h1 className="text-lg font-bold text-[var(--primary)]">مخطط الدراسة</h1>
            </div>
            <div className="flex items-center gap-4 mr-auto">
              {/* Sync Status Indicator */}
              <div className="flex items-center gap-2 text-xs font-medium">
                {!isOnline ? (
                  <span className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-1 rounded-full border border-amber-200">
                    <span className="relative flex h-2 w-2">
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                    </span>
                    غير متصل
                  </span>
                ) : isSyncing ? (
                  <span className="flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-1 rounded-full border border-blue-200">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    جاري المزامنة...
                  </span>
                ) : pendingCount > 0 ? (
                  <span className="flex items-center gap-1 text-[var(--primary)] bg-[var(--bg)] px-2 py-1 rounded-full border border-[var(--border)]">
                    <RefreshCw className="h-3 w-3" />
                    {`يتم رفع ${pendingCount} عناصر...`}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-200">
                    <span className="relative flex h-2 w-2">
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    تمت المزامنة
                  </span>
                )}
              </div>
            </div>
          </div>
          {(lastSyncError || failedCount > 0) && (
            <div className="bg-red-50 px-4 py-3 border-b border-red-100 flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <div className="text-xs font-semibold text-red-800">تفاصيل خطأ المزامنة:</div>
                {failedCount > 0 && (
                  <button 
                    onClick={clearFailedMutations}
                    className="text-[10px] bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded transition-colors"
                  >
                    حذف العناصر الفاشلة ({failedCount})
                  </button>
                )}
              </div>
              {lastSyncError && <div className="text-xs text-red-600">{lastSyncError}</div>}
              {rawLastError && <div className="text-[10px] text-red-500 font-mono bg-red-100/50 p-1 rounded overflow-x-auto">{rawLastError}</div>}
              <div className="text-[10px] text-red-500">العناصر المعلقة: {pendingCount}</div>
            </div>
          )}
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6">
          <Outlet />
        </main>

        {/* Footer */}
        <footer className="border-t border-[var(--border)] bg-[var(--card)] py-4 text-center text-xs text-[var(--muted)] theme-transition">
          Created by Aws Faisal (أوس فيصل) © 2026 — All Rights Reserved.
        </footer>
      </div>

      {/* Floating Action Button for Mobile */}
      <button
        onClick={() => setIsQuickAddOpen(true)}
        className="md:hidden fixed bottom-20 left-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--primary)] text-white shadow-lg hover:opacity-90 active:scale-95 transition-transform"
      >
        <Zap className="h-6 w-6" />
      </button>

      {/* Bottom Nav for Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 flex h-16 border-t border-[var(--border)] bg-[var(--card)] md:hidden z-30 theme-transition">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
                isActive ? 'text-[var(--primary)]' : 'text-[var(--muted)] hover:text-[var(--text)]'
              )
            }
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <QuickAddDialog
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onSubmit={handleTaskSubmit}
        subjects={subjects}
        schedule={schedule}
        slotTimes={slotTimes}
      />
      
      {false && <DebugPanel />}
    </div>
  );
}
