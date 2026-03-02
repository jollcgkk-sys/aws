import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/db';
import { syncController } from '../lib/SyncController';

export function DebugPanel() {
  const { user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isResyncing, setIsResyncing] = useState(false);

  const handleForceResync = async () => {
    if (!user || !confirm('Are you sure? This will DELETE local cache and re-fetch from server.')) return;
    
    setIsResyncing(true);
    try {
      const userId = user.id;
      console.log('[Debug] Force Resync initiated for user', userId);
      
      await db.transaction('rw', [db.subjects, db.tasks, db.weekly_schedule, db.day_notes, db.slot_times, db.user_settings], async () => {
        await db.subjects.where('user_id').equals(userId).delete();
        await db.tasks.where('user_id').equals(userId).delete();
        await db.weekly_schedule.where('user_id').equals(userId).delete();
        await db.day_notes.where('user_id').equals(userId).delete();
        await db.slot_times.where('user_id').equals(userId).delete();
        await db.user_settings.where('user_id').equals(userId).delete();
      });
      
      console.log('[Debug] Local cache cleared. Triggering sync with force=true...');
      await syncController.sync(userId, { force: true });
      console.log('[Debug] Force sync completed.');
      alert('Resync complete.');
    } catch (e: any) {
      console.error('Force resync failed:', e);
      alert('Error: ' + e.message);
    } finally {
      setIsResyncing(false);
    }
  };

  useEffect(() => {
    if (!user || !isOpen) return;

    const loadStats = async () => {
      try {
        const userId = user.id;
        
        const [
          subjectsCount,
          tasksCount,
          scheduleCount,
          slotTimesCount,
          dayNotesCount,
          scheduleRows,
          subjectsRows
        ] = await Promise.all([
          db.subjects.where('user_id').equals(userId).count(),
          db.tasks.where('user_id').equals(userId).count(),
          db.weekly_schedule.where('user_id').equals(userId).count(),
          db.slot_times.where('user_id').equals(userId).count(),
          db.day_notes.where('user_id').equals(userId).count(),
          db.weekly_schedule.where('user_id').equals(userId).limit(5).toArray(),
          db.subjects.where('user_id').equals(userId).limit(5).toArray()
        ]);

        // Histogram for day_of_week
        const allSchedule = await db.weekly_schedule.where('user_id').equals(userId).toArray();
        const histogram: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
        allSchedule.forEach(s => {
          if (s.day_of_week !== undefined && histogram[s.day_of_week] !== undefined) {
            histogram[s.day_of_week]++;
          }
        });

        setStats({
          counts: {
            subjects: subjectsCount,
            tasks: tasksCount,
            weekly_schedule: scheduleCount,
            slot_times: slotTimesCount,
            day_notes: dayNotesCount
          },
          histogram,
          scheduleRows: scheduleRows.map(r => ({ id: r.id, day_of_week: r.day_of_week, subject_id: r.subject_id, sync_status: r.sync_status })),
          subjectsRows: subjectsRows.map(r => ({ id: r.id, name: r.name, user_id: r.user_id, sync_status: r.sync_status }))
        });
      } catch (err) {
        console.error('DebugPanel error:', err);
      }
    };

    loadStats();
    const interval = setInterval(loadStats, 5000);
    return () => clearInterval(interval);
  }, [user, isOpen]);

  if (!user) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="bg-[var(--primary)] text-white px-3 py-1 rounded-md text-xs shadow-lg opacity-50 hover:opacity-100"
      >
        {isOpen ? 'Close Debug' : 'Debug'}
      </button>
      
      {isOpen && stats && (
        <div className="absolute bottom-10 right-0 w-96 max-h-[80vh] overflow-y-auto bg-[var(--primary)] text-green-400 p-4 rounded-lg shadow-2xl text-xs font-mono border border-[var(--border)]">
          <h3 className="text-white font-bold mb-2 border-b border-[var(--border)] pb-1">Diagnostics</h3>
          
          <div className="mb-2">
            <span className="text-[var(--muted)]">User ID:</span> {user.id}
          </div>
          <div className="mb-2">
            <span className="text-[var(--muted)]">Online:</span> {navigator.onLine ? 'Yes' : 'No'}
          </div>

          <div className="mb-4 border-t border-[var(--border)] pt-2">
            <button
              onClick={handleForceResync}
              disabled={isResyncing}
              className="w-full bg-red-900/50 hover:bg-red-800 text-red-200 px-2 py-1 rounded text-xs border border-red-800 transition-colors"
            >
              {isResyncing ? 'Resyncing...' : 'Force Resync (Reset Local)'}
            </button>
          </div>
          
          <div className="mb-2">
            <h4 className="text-white font-semibold mt-2">Dexie Counts</h4>
            <pre>{JSON.stringify(stats.counts, null, 2)}</pre>
          </div>
          
          <div className="mb-2">
            <h4 className="text-white font-semibold mt-2">Schedule Day Histogram</h4>
            <pre>{JSON.stringify(stats.histogram, null, 2)}</pre>
          </div>
          
          <div className="mb-2">
            <h4 className="text-white font-semibold mt-2">Sample Schedule (5)</h4>
            <pre className="overflow-x-auto">{JSON.stringify(stats.scheduleRows, null, 2)}</pre>
          </div>
          
          <div className="mb-2">
            <h4 className="text-white font-semibold mt-2">Sample Subjects (5)</h4>
            <pre className="overflow-x-auto">{JSON.stringify(stats.subjectsRows, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
