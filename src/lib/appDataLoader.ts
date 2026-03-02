import { db } from './db';
import { syncController } from './SyncController';

export async function ensureAppDataLoaded(userId: string, options: { force?: boolean } = {}) {
  if (!userId) return;

  const { force = false } = options;

  try {
    // Always compute local counts first
    const [subjectsCount, tasksCount, scheduleCount, dayNotesCount, slotTimesCount, userSettingsCount] = await Promise.all([
      db.subjects.where('user_id').equals(userId).count(),
      db.tasks.where('user_id').equals(userId).count(),
      db.weekly_schedule.where('user_id').equals(userId).count(),
      db.day_notes.where('user_id').equals(userId).count(),
      db.slot_times.where('user_id').equals(userId).count(),
      db.user_settings.where('user_id').equals(userId).count()
    ]);

    console.log(`[ensureAppDataLoaded] user: ${userId}, subjectsCount: ${subjectsCount}`);

    // Staleness window: 5 minutes
    const isStale = !syncController.lastSuccess || (Date.now() - syncController.lastSuccess > 5 * 60 * 1000);
    const isCriticalEmpty = subjectsCount === 0 || slotTimesCount === 0;
    const shouldSync = force || isStale || isCriticalEmpty;

    console.log(`[ensureAppDataLoaded] calling syncController.sync... (force=${shouldSync})`);
    
    console.log(`[Diagnostics] Dexie counts BEFORE sync for user ${userId}: subjects=${subjectsCount}, tasks=${tasksCount}, schedule=${scheduleCount}, dayNotes=${dayNotesCount}, slotTimes=${slotTimesCount}, userSettings=${userSettingsCount}`);

    // Use SyncController
    await syncController.sync(userId, { force: shouldSync });
    
    // Log Dexie counts after sync
    const [subjectsCountAfter, tasksCountAfter, scheduleCountAfter, dayNotesCountAfter, slotTimesCountAfter, userSettingsCountAfter] = await Promise.all([
      db.subjects.where('user_id').equals(userId).count(),
      db.tasks.where('user_id').equals(userId).count(),
      db.weekly_schedule.where('user_id').equals(userId).count(),
      db.day_notes.where('user_id').equals(userId).count(),
      db.slot_times.where('user_id').equals(userId).count(),
      db.user_settings.where('user_id').equals(userId).count()
    ]);
    
    console.log(`[Diagnostics] Dexie counts AFTER sync for user ${userId}: subjects=${subjectsCountAfter}, tasks=${tasksCountAfter}, schedule=${scheduleCountAfter}, dayNotes=${dayNotesCountAfter}, slotTimes=${slotTimesCountAfter}, userSettings=${userSettingsCountAfter}`);
    
    console.log(`[Diagnostics] ensureAppDataLoaded: Completed for user ${userId}`);
  } catch (error) {
    console.error('[Diagnostics] ensureAppDataLoaded: Error loading app data:', error);
    window.dispatchEvent(new CustomEvent('sync-error', { detail: 'حدث خطأ أثناء مزامنة البيانات. يرجى التحقق من اتصالك بالإنترنت.' }));
  }
}
