import { db } from './db';
import { fetchUserData, saveUserData, processPendingMutations } from './sync';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'success';

class SyncController {
  private isSyncing = false;
  private syncPromise: Promise<void> | null = null;
  private retryTimeout: NodeJS.Timeout | null = null;
  
  // State
  public status: SyncStatus = 'idle';
  public lastError: string | null = null;
  public lastSuccess: number | null = null;
  public nextRetryAt: number | null = null;
  private retryCount = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleOnline());
      document.addEventListener('visibilitychange', () => this.handleVisibilityChange());
      window.addEventListener('sync-needed', (e: any) => {
        if (e.detail && e.detail.userId) {
          this.sync(e.detail.userId);
        }
      });
      
      // Load state from localStorage if available
      try {
        const stored = localStorage.getItem('sync_state');
        if (stored) {
          const parsed = JSON.parse(stored);
          this.lastSuccess = parsed.lastSuccess;
          this.lastError = parsed.lastError;
        }
      } catch (e) {
        // ignore
      }
    }
  }

  private persistState() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sync_state', JSON.stringify({
        lastSuccess: this.lastSuccess,
        lastError: this.lastError
      }));
    }
    this.emitChange();
  }

  private emitChange() {
    window.dispatchEvent(new CustomEvent('sync-status-change', { 
      detail: { 
        status: this.status, 
        lastError: this.lastError, 
        lastSuccess: this.lastSuccess 
      } 
    }));
  }

  private async handleOnline() {
    console.log('[SyncController] App is online, triggering sync...');
    // We need a way to know the current user. 
    // Since we don't store user ID here, we rely on the app to call sync() when needed.
    // But if we have a pending retry, we should execute it.
    if (this.nextRetryAt && Date.now() >= this.nextRetryAt) {
      // We can't retry without userId. 
      // This is a limitation of this singleton design without user context.
      // We'll rely on AuthContext or components to trigger sync on 'online' via their own listeners if needed,
      // or we can store userId in sync() call.
    }
  }

  private handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      // Logic to trigger sync if stale
    }
  }

  public async sync(userId: string, options: { force?: boolean } = {}) {
    if (!userId) return;
    if (!navigator.onLine) {
      console.log('[SyncController] Offline, skipping sync.');
      return;
    }

    const { force = false } = options;
    const now = Date.now();

    // Debounce/Throttle
    if (!force && this.isSyncing) {
      console.log('[SyncController] Sync already in progress, returning existing promise.');
      return this.syncPromise;
    }

    // 10s throttle for non-forced syncs
    if (!force && this.lastSuccess && (now - this.lastSuccess < 10000)) {
       console.log('[SyncController] Sync throttled (last success < 10s ago).');
       return;
    }

    this.isSyncing = true;
    this.status = 'syncing';
    this.emitChange();
    
    console.log(`[SyncController] Starting sync for user ${userId} (force=${force})...`);

    // Safety timeout to prevent stuck state
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('Sync timed out after 45s')), 45000);
    });

    this.syncPromise = Promise.race([this._performSync(userId, options), timeoutPromise])
      .then(() => {
        console.log('[SyncController] Sync completed successfully.');
        this.status = 'success';
        this.lastSuccess = Date.now();
        this.lastError = null;
        this.retryCount = 0;
        this.nextRetryAt = null;
        this.persistState();
        window.dispatchEvent(new CustomEvent('sync-complete'));
      })
      .catch((err) => {
        const isNetworkError = err.message === 'Failed to fetch' || err.message.includes('Network request failed');

        if (isNetworkError) {
          console.warn('[SyncController] Network error (offline?), skipping sync error dispatch.');
          // Don't mark as error state for simple connectivity issues
          this.status = 'idle';
        } else {
          console.error('[SyncController] Sync failed:', err);
          this.status = 'error';
          this.lastError = err.message;
          this.persistState();
          window.dispatchEvent(new CustomEvent('sync-error', { detail: err.message }));
        }
        
        // Schedule retry with exponential backoff
        this.scheduleRetry(userId);
      })
      .finally(() => {
        this.isSyncing = false;
        this.syncPromise = null;
        this.emitChange();
      });

    return this.syncPromise;
  }

  private scheduleRetry(userId: string) {
    if (this.retryCount >= 5) {
      console.warn('[SyncController] Max retries reached, giving up.');
      return;
    }

    this.retryCount++;
    const delay = Math.pow(2, this.retryCount) * 1000; // 2s, 4s, 8s, 16s, 32s
    this.nextRetryAt = Date.now() + delay;
    
    console.log(`[SyncController] Scheduling retry #${this.retryCount} in ${delay}ms`);
    
    if (this.retryTimeout) clearTimeout(this.retryTimeout);
    this.retryTimeout = setTimeout(() => {
      this.sync(userId, { force: true });
    }, delay);
  }

  private async _performSync(userId: string, options: { force?: boolean } = {}) {
    // 1. Push pending mutations first
    await processPendingMutations();

    // 2. Fetch data from Supabase (OUTSIDE transaction)
    const data = await fetchUserData(userId);

    // 3. Write data to Dexie (INSIDE transaction for atomicity)
    await db.transaction('rw', [db.subjects, db.tasks, db.weekly_schedule, db.day_notes, db.slot_times, db.user_settings], async () => {
      await saveUserData(data, userId, { force: options.force });
    });
  }
}

export const syncController = new SyncController();
