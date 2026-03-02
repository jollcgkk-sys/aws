import { createContext, useContext, useEffect, useState } from 'react';
import { db } from '../lib/db';
import { syncController, SyncStatus } from '../lib/SyncController';
import { supabase } from '../lib/supabase';
import { useLiveQuery } from 'dexie-react-hooks';

interface SyncContextType {
  isOnline: boolean;
  pendingCount: number;
  failedCount: number;
  triggerSync: () => Promise<void>;
  lastSyncError: string | null;
  rawLastError: string | null;
  isSyncing: boolean;
  status: SyncStatus;
  clearFailedMutations: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [status, setStatus] = useState<SyncStatus>(syncController.status);
  const [lastSyncError, setLastSyncError] = useState<string | null>(syncController.lastError);
  const [rawLastError, setRawLastError] = useState<string | null>(null);
  
  const pendingCount = useLiveQuery(
    () => db.pending_mutations.where('status').notEqual('failed').count()
      .catch(() => db.pending_mutations.count()),
    [],
    0
  );

  const failedCount = useLiveQuery(
    () => db.pending_mutations.where('status').equals('failed').count()
      .catch(() => 0),
    [],
    0
  );

  // Get the most recent raw error
  useLiveQuery(
    async () => {
      const lastFailed = await db.pending_mutations
        .where('status').equals('failed')
        .reverse()
        .first()
        .catch(() => null);
      
      if (lastFailed && lastFailed.last_error) {
        setRawLastError(lastFailed.last_error);
      } else {
        setRawLastError(null);
      }
    },
    []
  );

  useEffect(() => {
    const handleStatusChange = (e: CustomEvent) => {
      setStatus(e.detail.status);
      setLastSyncError(e.detail.lastError);
    };

    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };
    const handleOffline = () => setIsOnline(false);
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        triggerSync();
      }
    };

    window.addEventListener('sync-status-change', handleStatusChange as EventListener);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial sync
    if (navigator.onLine) {
      triggerSync();
    }

    // Periodic sync every 60 seconds
    const intervalId = setInterval(() => {
      if (navigator.onLine) {
        triggerSync();
      }
    }, 60000);

    return () => {
      window.removeEventListener('sync-status-change', handleStatusChange as EventListener);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(intervalId);
    };
  }, []);

  const triggerSync = async () => {
    if (!navigator.onLine) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await syncController.sync(session.user.id, { force: true });
      }
    } catch (err) {
      console.error('Trigger sync failed:', err);
    }
  };

  const clearFailedMutations = async () => {
    try {
      const failedMutations = await db.pending_mutations.where('status').equals('failed').toArray();
      const ids = failedMutations.map(m => m.id);
      await db.pending_mutations.bulkDelete(ids);
      setRawLastError(null);
      setLastSyncError(null);
    } catch (err) {
      console.error('Error clearing failed mutations', err);
    }
  };

  return (
    <SyncContext.Provider value={{ 
      isOnline, 
      pendingCount, 
      failedCount,
      triggerSync, 
      lastSyncError, 
      rawLastError,
      isSyncing: status === 'syncing',
      status,
      clearFailedMutations
    }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}
