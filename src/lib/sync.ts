import { db } from './db';
import { supabase } from './supabase';
import { uuid } from './uuid';

export async function fetchUserData(userId: string) {
  if (!navigator.onLine) return null;

  const fetchAll = async (table: string) => {
    let allData: any[] = [];
    let page = 0;
    const pageSize = 1000;

    const ORDER_BY: Record<string, string | null> = {
      subjects: 'created_at',
      tasks: 'created_at',
      weekly_schedule: 'created_at',
      day_notes: 'created_at',
      slot_times: null,
      user_settings: null,
    };
    
    while (true) {
      const buildQuery = (withOrder: boolean) => {
        let q = supabase
          .from(table)
          .select('*')
          .eq('user_id', userId);
          
        if (withOrder && ORDER_BY[table]) {
          q = q.order(ORDER_BY[table]!, { ascending: true });
        }
        return q.range(page * pageSize, (page + 1) * pageSize - 1);
      };

      let { data, error } = await buildQuery(true);

      // Fallback: If ordering fails (e.g. column missing), retry without order
      if (error && (error.code === '42703' || error.message.includes('column') && error.message.includes('does not exist'))) {
         console.warn(`[Sync Warning] Order by ${ORDER_BY[table]} failed for ${table}. Retrying without order.`);
         ({ data, error } = await buildQuery(false));
      }
        
      console.log(`[FETCH] ${table} page=${page} server length=${data?.length ?? 'undefined'} error=${error?.message ?? 'null'} user=${userId}`);

      if (error) throw error;
      if (!data || data.length === 0) break;
      
      allData = allData.concat(data);
      
      if (data.length < pageSize) break;
      page++;
    }
    return allData;
  };

  try {
    console.log(`[Sync] Starting fetchUserData for user ${userId}`);
    const [subjects, tasks, schedule, dayNotes, slotTimes, userSettings] = await Promise.all([
      fetchAll('subjects'),
      fetchAll('tasks'),
      fetchAll('weekly_schedule'),
      fetchAll('day_notes'),
      fetchAll('slot_times'),
      fetchAll('user_settings')
    ]);

    console.log(`[Diagnostics] fetchUserData counts for user ${userId}: subjects=${subjects.length}, tasks=${tasks.length}, schedule=${schedule.length}, dayNotes=${dayNotes.length}, slotTimes=${slotTimes.length}, userSettings=${userSettings.length}`);

    return { subjects, tasks, schedule, dayNotes, slotTimes, userSettings };
  } catch (error: any) {
    if (error.message === 'Failed to fetch' || error.message.includes('Network request failed')) {
      console.warn('[Sync] Network error during fetchUserData:', error.message);
    } else {
      console.error('[Sync] fetchUserData failed:', error);
    }
    throw error;
  }
}

export async function saveUserData(data: any, userId: string, options: { force?: boolean } = {}) {
  if (!data || !userId) return;
  const { subjects, tasks, schedule, dayNotes, slotTimes, userSettings } = data;
  const { force = false } = options;

  // Helper to sync a table: bulkPut new/updated, bulkDelete missing
  const syncTable = async (table: any, serverData: any[], tableName: string) => {
    if (!serverData) return;
    
    // 1. Get all local IDs for this user
    const localRecords = await table.where('user_id').equals(userId).toArray();
    
    // 2. Filter out pending mutations from deletion candidates
    // CRITICAL: Never delete a record that is pending upload!
    const syncedLocalRecords = localRecords.filter((r: any) => r.sync_status !== 'pending');
    const syncedLocalIds = new Set(syncedLocalRecords.map((r: any) => r.id));
    
    // SAFETY CHECK: Prevent data wipe
    if (serverData.length === 0 && syncedLocalRecords.length > 0) {
      console.error(`[Sync Safety] ABORTING DELETE for ${tableName}. Server returned 0 items, but local has ${syncedLocalRecords.length}. Keeping local data.`);
      return; // Stop processing this table
    }

    // SAFETY CHECK: Warn if both are zero (potential RLS or query issue for existing users)
    if (serverData.length === 0 && syncedLocalRecords.length === 0 && tableName === 'subjects') {
       console.warn(`[Sync Warning] Server returned 0 subjects and local is 0. If this is not a new user, check RLS or fetch query.`);
       // We don't throw here to allow new users to start fresh, but we log it visibly.
       // The user requested a visible error:
       // window.dispatchEvent(new CustomEvent('sync-error', { detail: 'Server returned 0 subjects. Check fetch query or RLS.' }));
       // However, this triggers for every new user. 
       // We will only trigger it if we suspect something is wrong, or maybe just log it as requested by "Do NOT silently continue".
       // Let's use a console.error so it shows up in logs, and maybe a toast if we can determine it's not a new user (hard to know).
       // For now, I will dispatch the event as requested, but maybe with a caveat or just log it if I can't distinguish.
       // The prompt said: "If serverData.length === 0 AND local is 0 too, show a visible error ... Do NOT silently continue."
       // I will dispatch it.
       window.dispatchEvent(new CustomEvent('sync-error', { detail: `تحذير: لم يتم العثور على مواد (Subjects) في السيرفر. (0 items)` }));
    }

    // SAFETY CHECK: suspicious drop in count
    if (!force && syncedLocalRecords.length > 5 && serverData.length < syncedLocalRecords.length * 0.5) {
      console.warn(`[Sync Safety] Suspicious drop in ${tableName}. Server: ${serverData.length}, Local: ${syncedLocalRecords.length}. Skipping delete.`);
      // We continue to UPSERT server updates, but we skip DELETE
    } else {
      // 3. Identify server IDs
      const serverIds = new Set(serverData.map((r: any) => r.id));
      
      // 4. Find IDs to delete (exist locally as 'synced' but not on server)
      const idsToDelete = [...syncedLocalIds].filter(id => !serverIds.has(id));
      
      // 5. Perform updates
      if (idsToDelete.length > 0) {
        console.log(`[Sync] Deleting ${idsToDelete.length} stale records from ${tableName}`);
        await table.bulkDelete(idsToDelete);
      }
    }
    
    if (serverData.length > 0) {
      // Strategy: Only update records that are NOT pending.
      const pendingIds = new Set(localRecords.filter((r: any) => r.sync_status === 'pending').map((r: any) => r.id));
      
      const recordsToPut = serverData
        .filter((r: any) => !pendingIds.has(r.id))
        .map((r: any) => {
          const record = { ...r, sync_status: 'synced' };
          if ('day_of_week' in record && record.day_of_week !== null && record.day_of_week !== undefined) {
            record.day_of_week = Number(record.day_of_week);
          }
          return record;
        });
        
      if (recordsToPut.length > 0) {
        await table.bulkPut(recordsToPut);
      }
    }
  };

  await syncTable(db.subjects, subjects, 'subjects');
  await syncTable(db.tasks, tasks, 'tasks');
  await syncTable(db.weekly_schedule, schedule, 'weekly_schedule');
  await syncTable(db.day_notes, dayNotes, 'day_notes');
  await syncTable(db.slot_times, slotTimes, 'slot_times');
  
  // User settings is usually 1 row per user
  if (userSettings && userSettings.length > 0) {
     await db.user_settings.bulkPut(userSettings.map((s: any) => ({ ...s, sync_status: 'synced' })));
  }
  
  // Log counts after save
  const subjectsCount = await db.subjects.where('user_id').equals(userId).count();
  console.log(`[Sync] After saveUserData: subjects=${subjectsCount}`);
}

export async function syncDown(userId: string) {
  const data = await fetchUserData(userId);
  await saveUserData(data, userId);
}

export function sanitizePayload(payload: any): any {
  if (!payload) return payload;
  
  if (Array.isArray(payload)) {
    return payload.map(item => sanitizePayload(item));
  }
  
  if (typeof payload === 'object') {
    const clean = { ...payload };
    
    // Remove local-only fields
    delete clean.sync_status;
    delete clean.local_id;
    delete clean.__typename;
    
    // Remove undefined fields and recursively sanitize nested objects
    Object.keys(clean).forEach(key => {
      if (clean[key] === undefined) {
        delete clean[key];
      } else if (typeof clean[key] === 'object' && clean[key] !== null) {
        clean[key] = sanitizePayload(clean[key]);
      }
    });
    
    return clean;
  }
  
  return payload;
}

export async function processPendingMutations() {
  if (!navigator.onLine) return;

  // Ensure user session exists
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.dispatchEvent(new CustomEvent('sync-error', { detail: 'انتهت الجلسة، الرجاء تسجيل الدخول مجددًا' }));
    return;
  }

  const userId = session.user.id;

  // Get only pending mutations for CURRENT USER
  const pending = await db.pending_mutations
    .where('user_id')
    .equals(userId)
    .and(m => m.status !== 'failed')
    .sortBy('created_at');
    
  // Sort by priority to ensure correct deletion order (children before parent)
  // This is critical if timestamps are identical (e.g. batch deletion)
  const activeMutations = pending.sort((a, b) => {
    // Priority map: higher number = later execution
    const getPriority = (type: string) => {
      if (type === 'delete_subject') return 100; // Last
      if (type.startsWith('delete_')) return 10; // First (children)
      return 50; // Others
    };
    
    const priorityA = getPriority(a.type);
    const priorityB = getPriority(b.type);
    
    if (priorityA !== priorityB) return priorityA - priorityB; // Lower priority first
    
    const timeA = new Date(a.created_at).getTime();
    const timeB = new Date(b.created_at).getTime();
    
    if (timeA !== timeB) return timeA - timeB;
    
    return a.id.localeCompare(b.id);
  });

  if (activeMutations.length === 0) return;

  const now = Date.now();

  for (const mutation of activeMutations) {
    console.log('[MUTATION]', mutation.type, mutation.id, mutation.created_at);

    // Exponential backoff check
    if (mutation.retry_count && mutation.retry_count > 0 && mutation.last_attempt_at) {
      const backoffDelay = Math.pow(2, mutation.retry_count) * 1000; // 2s, 4s, 8s, 16s, 32s
      if (now - mutation.last_attempt_at < backoffDelay) {
        console.log(`Skipping mutation ${mutation.id} due to backoff (retry ${mutation.retry_count})`);
        continue;
      }
    }

    try {
      let error = null;
      const cleanPayload = sanitizePayload(mutation.payload);
      
      let tableName = '';
      switch (mutation.type) {
        case 'create_task':
        case 'update_task':
          tableName = 'tasks';
          ({ error } = await supabase.from('tasks').upsert(cleanPayload));
          if (!error) await db.tasks.update(mutation.payload.id, { sync_status: 'synced' });
          break;
        case 'delete_task':
          tableName = 'tasks';
          ({ error } = await supabase.from('tasks').delete().eq('id', mutation.payload.id));
          if (!error) await db.tasks.delete(mutation.payload.id);
          break;
        case 'create_subject':
        case 'update_subject':
          tableName = 'subjects';
          ({ error } = await supabase.from('subjects').upsert(cleanPayload));
          if (!error) await db.subjects.update(mutation.payload.id, { sync_status: 'synced' });
          break;
        case 'delete_subject':
          tableName = 'subjects';
          ({ error } = await supabase.from('subjects').delete().eq('id', mutation.payload.id).eq('user_id', userId));
          if (!error) {
            await db.subjects.delete(mutation.payload.id);
            console.log('[DELETE SUBJECT] server success');
          }
          break;
        case 'create_day_note':
        case 'update_day_note':
          tableName = 'day_notes';
          ({ error } = await supabase.from('day_notes').upsert(cleanPayload));
          if (!error) await db.day_notes.update(mutation.payload.id, { sync_status: 'synced' });
          break;
        case 'delete_day_note':
          tableName = 'day_notes';
          ({ error } = await supabase.from('day_notes').delete().eq('id', mutation.payload.id));
          if (!error) await db.day_notes.delete(mutation.payload.id);
          break;
        case 'update_schedule':
          tableName = 'weekly_schedule';
          ({ error } = await supabase.from('weekly_schedule').upsert(cleanPayload));
          if (!error) await db.weekly_schedule.update(mutation.payload.id, { sync_status: 'synced' });
          break;
        case 'delete_schedule':
          tableName = 'weekly_schedule';
          ({ error } = await supabase.from('weekly_schedule').delete().eq('id', mutation.payload.id));
          if (!error) await db.weekly_schedule.delete(mutation.payload.id);
          break;
        case 'update_slot_time':
          tableName = 'slot_times';
          ({ error } = await supabase.from('slot_times').upsert(cleanPayload));
          if (!error) await db.slot_times.update(mutation.payload.id, { sync_status: 'synced' });
          break;
        case 'upsert_user_settings':
          tableName = 'user_settings';
          const settingsPayload = {
            user_id: cleanPayload.user_id,
            slot_count: cleanPayload.slot_count,
            theme_key: cleanPayload.theme_key || 'default',
            reduce_motion: cleanPayload.reduce_motion || false,
            updated_at: cleanPayload.updated_at
          };
          ({ error } = await supabase.from('user_settings').upsert(settingsPayload));
          if (!error) await db.user_settings.update(mutation.payload.user_id, { sync_status: 'synced' });
          break;
        case 'delete_slot_times_after':
          tableName = 'slot_times';
          ({ error } = await supabase.from('slot_times').delete().eq('user_id', mutation.payload.user_id).gt('slot', mutation.payload.slot_count));
          break;
      }

      if (error) {
        console.error(`Sync error for mutation ${mutation.id}:`, {
          type: mutation.type,
          table: tableName,
          payload: cleanPayload,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        
        let errorMessage = error.message;
        
        // Handle specific Supabase errors
        if (error.code === 'PGRST301' || error.message.includes('JWT')) {
          errorMessage = 'انتهت الجلسة، الرجاء تسجيل الدخول مجددًا';
        } else if (error.code === '42501' || error.message.includes('RLS')) {
          errorMessage = 'ليس لديك صلاحية لإجراء هذا التعديل';
        } else if (error.code === '42703' || error.message.includes('column does not exist')) {
          errorMessage = 'يوجد خطأ في تحديث قاعدة البيانات، يرجى تحديث التطبيق';
        } else if (error.code === '42P01' || error.message.includes('relation') || error.message.includes('does not exist')) {
          errorMessage = `الجدول ${tableName} غير موجود في قاعدة البيانات`;
        }
        
        // Dispatch a custom event to notify the UI about the error
        window.dispatchEvent(new CustomEvent('sync-error', { detail: errorMessage }));

        const retryCount = (mutation.retry_count || 0) + 1;
        const rawErrorMsg = `[${error.code}] ${error.message}`;
        
        if (retryCount > 5) {
          // Mark as failed but don't block the queue
          await db.pending_mutations.update(mutation.id, {
            retry_count: retryCount,
            last_error: rawErrorMsg,
            status: 'failed',
            last_attempt_at: Date.now()
          });
          console.warn(`Mutation ${mutation.id} failed after 5 retries. Marked as failed.`);
        } else {
          // Update retry count and error
          await db.pending_mutations.update(mutation.id, {
            retry_count: retryCount,
            last_error: rawErrorMsg,
            last_attempt_at: Date.now()
          });
        }

        // If auth error, we might want to pause. For now, just log and continue or break.
        if (error.code === 'PGRST301' || error.message.includes('JWT')) {
          console.error('Auth error during sync, pausing sync. User might need to re-login.', error);
          break; // Stop processing queue on auth error
        }
      } else {
        await db.pending_mutations.delete(mutation.id);
      }
    } catch (err: any) {
      const isNetworkError = err.message === 'Failed to fetch' || err.message.includes('Network request failed');
      
      if (isNetworkError) {
        console.warn('[Sync] Network error during mutation processing, pausing queue.');
      } else {
        console.error('Unexpected error during sync', err);
        window.dispatchEvent(new CustomEvent('sync-error', { detail: err.message || 'Unknown error' }));
      }
      
      const retryCount = (mutation.retry_count || 0) + 1;
      await db.pending_mutations.update(mutation.id, {
        retry_count: retryCount,
        last_error: err.message || 'Unknown error',
        status: retryCount > 5 ? 'failed' : 'pending',
        last_attempt_at: Date.now()
      });
      
      break; // Stop processing on error
    }
  }
}

export async function queueMutation(type: string, payload: any, userId: string) {
  const mutationId = uuid();
  const cleanPayload = sanitizePayload(payload);
  
  try {
    await db.pending_mutations.add({
      id: mutationId,
      user_id: userId,
      type,
      payload: cleanPayload,
      created_at: new Date().toISOString(),
      status: 'pending',
      retry_count: 0,
      last_error: undefined // Dexie handles undefined well, but we can omit or use undefined
    });

    // Optimistically update local DB
    const tableMap: Record<string, any> = {
      'create_task': db.tasks,
      'update_task': db.tasks,
      'delete_task': db.tasks,
      'create_subject': db.subjects,
      'update_subject': db.subjects,
      'delete_subject': db.subjects,
      'create_day_note': db.day_notes,
      'update_day_note': db.day_notes,
      'delete_day_note': db.day_notes,
      'update_schedule': db.weekly_schedule,
      'delete_schedule': db.weekly_schedule,
      'update_slot_time': db.slot_times,
      'upsert_user_settings': db.user_settings,
    };

    const table = tableMap[type];
    if (table) {
      if (type.startsWith('delete_')) {
        await table.delete(payload.id);
      } else {
        await table.put({ ...payload, sync_status: 'pending' });
      }
    } else if (type === 'delete_slot_times_after') {
      const slotsToDelete = await db.slot_times
        .where('user_id').equals(payload.user_id)
        .and(s => s.slot > payload.slot_count)
        .toArray();
      await db.slot_times.bulkDelete(slotsToDelete.map(s => s.id));
    }

    // Trigger sync if online via SyncController
    if (navigator.onLine) {
      window.dispatchEvent(new CustomEvent('sync-needed', { detail: { userId } }));
    }
  } catch (error: any) {
    console.error(`[Sync] Failed to queue mutation ${type}:`, error);
    window.dispatchEvent(new CustomEvent('sync-error', { detail: `فشل حفظ التعديل محلياً: ${error.message}` }));
    throw error;
  }
}
