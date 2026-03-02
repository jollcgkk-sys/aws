import { db } from './db';

export async function migrateDayOfWeekToMondayFirst(userId: string) {
  const migrationKey = `migrated_day_v1_${userId}`;
  if (localStorage.getItem(migrationKey)) {
    return;
  }

  try {
    console.log(`[Migration] Starting day_of_week migration for user ${userId}`);
    
    // Migrate weekly_schedule
    const schedules = await db.weekly_schedule.where('user_id').equals(userId).toArray();
    let updatedScheduleCount = 0;
    for (const schedule of schedules) {
      if (schedule.day_of_week >= 0 && schedule.day_of_week <= 6) {
        const newDay = (Number(schedule.day_of_week) + 6) % 7;
        if (newDay !== schedule.day_of_week) {
          await db.weekly_schedule.update(schedule.id, { day_of_week: newDay });
          updatedScheduleCount++;
        }
      }
    }

    // Migrate day_notes
    const notes = await db.day_notes.where('user_id').equals(userId).toArray();
    let updatedNotesCount = 0;
    for (const note of notes) {
      if (note.day_of_week !== undefined && note.day_of_week !== null && note.day_of_week >= 0 && note.day_of_week <= 6) {
        const newDay = (Number(note.day_of_week) + 6) % 7;
        if (newDay !== note.day_of_week) {
          await db.day_notes.update(note.id, { day_of_week: newDay });
          updatedNotesCount++;
        }
      }
    }

    console.log(`[Migration] Completed. Updated ${updatedScheduleCount} schedules and ${updatedNotesCount} notes.`);
    localStorage.setItem(migrationKey, 'true');
  } catch (error) {
    console.error('[Migration] Failed to migrate day_of_week:', error);
  }
}
