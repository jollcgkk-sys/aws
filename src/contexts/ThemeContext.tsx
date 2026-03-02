import { createContext, useContext, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ThemeKey } from '../lib/db';
import { useAuth } from './AuthContext';
import { queueMutation } from '../lib/sync';

interface ThemeContextType {
  theme: ThemeKey;
  setTheme: (theme: ThemeKey) => Promise<void>;
  reduceMotion: boolean;
  setReduceMotion: (reduce: boolean) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [localTheme, setLocalTheme] = useState<ThemeKey>('default');
  const [localReduceMotion, setLocalReduceMotion] = useState(false);

  const userSettings = useLiveQuery(
    () => user ? db.user_settings.get(user.id) : undefined,
    [user?.id]
  );

  const theme = userSettings?.theme_key || localTheme;
  const reduceMotion = userSettings?.reduce_motion ?? localReduceMotion;

  useEffect(() => {
    if (theme) {
      document.documentElement.dataset.theme = theme;
    }
    if (reduceMotion) {
      document.documentElement.classList.add('reduce-motion');
    } else {
      document.documentElement.classList.remove('reduce-motion');
    }
  }, [theme, reduceMotion]);

  const setTheme = async (newTheme: ThemeKey) => {
    setLocalTheme(newTheme);
    document.documentElement.dataset.theme = newTheme;
    
    if (user) {
      const currentSettings = await db.user_settings.get(user.id);
      const updatedSettings = {
        user_id: user.id,
        slot_count: currentSettings?.slot_count || 6,
        theme_key: newTheme,
        reduce_motion: currentSettings?.reduce_motion ?? false,
        updated_at: new Date().toISOString()
      };
      
      await queueMutation('upsert_user_settings', updatedSettings, user.id);
    }
  };

  const setReduceMotion = async (reduce: boolean) => {
    setLocalReduceMotion(reduce);
    
    if (user) {
      const currentSettings = await db.user_settings.get(user.id);
      const updatedSettings = {
        user_id: user.id,
        slot_count: currentSettings?.slot_count || 6,
        theme_key: currentSettings?.theme_key || 'default',
        reduce_motion: reduce,
        updated_at: new Date().toISOString()
      };
      
      await queueMutation('upsert_user_settings', updatedSettings, user.id);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, reduceMotion, setReduceMotion }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
