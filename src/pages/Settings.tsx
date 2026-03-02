import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { LogOut, User as UserIcon, Clock, Save, Lock, Bell, Palette, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db, SlotTime, ThemeKey } from '../lib/db';
import { queueMutation } from '../lib/sync';
import { useLiveQuery } from 'dexie-react-hooks';
import { uuid } from '../lib/uuid';
import { cn } from '../lib/utils';
import { useTheme } from '../contexts/ThemeContext';
import { motion } from 'motion/react';
import { pageTransition } from '../lib/motion';

const THEMES: { id: ThemeKey; name: string; previewClass: string }[] = [
  { id: 'default', name: 'افتراضي', previewClass: 'bg-[var(--surface)] border-[var(--border)]' },
  { id: 'cats_night', name: 'قطط ليلية', previewClass: 'bg-[var(--primary)] border-[var(--primary)]' },
  { id: 'pink_cute', name: 'زهري', previewClass: 'bg-pink-100 border-pink-400' },
  { id: 'sandy_cat', name: 'رملي', previewClass: 'bg-amber-100 border-amber-400' },
];

export default function Settings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { theme, setTheme, reduceMotion, setReduceMotion } = useTheme();

  const slotTimes = useLiveQuery(() => db.slot_times.where('user_id').equals(user?.id || '').toArray(), [user?.id]) || [];
  const userSettings = useLiveQuery(() => db.user_settings.get(user?.id || ''), [user?.id]);
  
  const [slotsCount, setSlotsCount] = useState(6);
  const [localSlots, setLocalSlots] = useState<Record<number, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Password change state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [toast, setToast] = useState<{ id: string, message: string, isError?: boolean } | null>(null);

  useEffect(() => {
    if (!isInitialized && (userSettings !== undefined || slotTimes.length > 0)) {
      if (userSettings) {
        setSlotsCount(userSettings.slot_count);
      } else if (slotTimes.length > 0) {
        const maxSlot = Math.max(...slotTimes.map(s => s.slot));
        setSlotsCount(Math.max(6, maxSlot));
      }
      
      const newLocalSlots: Record<number, string> = {
        1: '08:30', 2: '10:30', 3: '12:30', 4: '14:30', 5: '16:30', 6: '18:30'
      };
      if (slotTimes.length > 0) {
        slotTimes.forEach(s => {
          newLocalSlots[s.slot] = s.start_time;
        });
      }
      setLocalSlots(newLocalSlots);
      setIsInitialized(true);
    }
  }, [slotTimes, userSettings, isInitialized]);

  const showToast = (message: string, isError = false) => {
    setToast({ id: uuid(), message, isError });
    setTimeout(() => setToast(null), 5000);
  };

  const handleLogout = async () => {
    try {
      if (user) {
        // Clear local data for this user to prevent leakage
        const userId = user.id;
        await Promise.all([
          db.subjects.where('user_id').equals(userId).delete(),
          db.tasks.where('user_id').equals(userId).delete(),
          db.weekly_schedule.where('user_id').equals(userId).delete(),
          db.day_notes.where('user_id').equals(userId).delete(),
          db.slot_times.where('user_id').equals(userId).delete(),
          db.user_settings.where('user_id').equals(userId).delete(),
          db.pending_mutations.where('user_id').equals(userId).delete()
        ]);
      }
    } catch (err) {
      console.error('Error clearing local data on logout:', err);
    }
    await supabase.auth.signOut();
    navigate('/login');
  };

  const handleTimeChange = (slot: number, time: string) => {
    setLocalSlots(prev => ({ ...prev, [slot]: time }));
  };

  const handleSaveSlots = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      // Save user settings (slot count)
      await queueMutation('upsert_user_settings', {
        user_id: user.id,
        slot_count: slotsCount,
        updated_at: new Date().toISOString()
      }, user.id);

      // Save individual slot times
      for (let i = 1; i <= slotsCount; i++) {
        const time = localSlots[i] || '08:00';
        const existing = slotTimes.find(s => s.slot === i);
        
        if (existing) {
          if (existing.start_time !== time) {
            await queueMutation('update_slot_time', { ...existing, start_time: time, updated_at: new Date().toISOString() }, user.id);
          }
        } else {
          const newSlot: SlotTime = {
            id: uuid(),
            user_id: user.id,
            slot: i,
            start_time: time,
            updated_at: new Date().toISOString()
          };
          await queueMutation('update_slot_time', newSlot, user.id);
        }
      }

      // Delete extra slots if count was reduced
      await queueMutation('delete_slot_times_after', {
        user_id: user.id,
        slot_count: slotsCount
      }, user.id);

      showToast('تم حفظ الإعدادات بنجاح');
    } catch (error) {
      showToast('حدث خطأ أثناء حفظ الإعدادات', true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      showToast('كلمة المرور يجب أن تكون 8 أحرف على الأقل', true);
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('كلمتا المرور غير متطابقتين', true);
      return;
    }

    setIsChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      
      showToast('تم تحديث كلمة المرور بنجاح');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Error changing password:', error);
      showToast(error.message || 'حدث خطأ أثناء تحديث كلمة المرور', true);
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <motion.div 
      className="space-y-6 max-w-2xl mx-auto relative"
      initial="initial"
      animate="animate"
      exit="exit"
      variants={pageTransition}
    >
      {/* Toast Notification */}
      {toast && (
        <div className={cn(
          "fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl px-4 py-3 text-white shadow-lg animate-in slide-in-from-top-4 fade-in duration-300",
          toast.isError ? "bg-red-600" : "bg-emerald-600"
        )}>
          <Bell className="h-5 w-5" />
          <span className="font-medium text-sm">{toast.message}</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-[var(--text)]">الإعدادات</h2>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm space-y-6 theme-transition">
        <div className="flex items-center gap-4 border-b border-[var(--border)] pb-6 theme-transition">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
            <UserIcon className="h-8 w-8" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[var(--text)]">الحساب</h3>
            <p className="text-sm text-[var(--muted)]" dir="ltr">{user?.email}</p>
          </div>
        </div>

        {/* Theme Settings */}
        <div className="space-y-4 pt-2 border-b border-[var(--border)] pb-6 theme-transition">
          <h4 className="text-sm font-medium text-[var(--text)] flex items-center gap-2">
            <Palette className="h-4 w-4 text-[var(--muted)]" />
            المظهر / الثيم
          </h4>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={cn(
                  "flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all",
                  theme === t.id 
                    ? "border-[var(--primary)] bg-[var(--primary)]/5" 
                    : "border-transparent hover:border-[var(--border)] bg-[var(--bg)]"
                )}
              >
                <div className={cn("w-full h-12 rounded-lg border", t.previewClass)} />
                <span className="text-xs font-medium text-[var(--text)]">{t.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Accessibility Settings */}
        <div className="space-y-4 pt-2 border-b border-[var(--border)] pb-6 theme-transition">
          <h4 className="text-sm font-medium text-[var(--text)] flex items-center gap-2">
            <Activity className="h-4 w-4 text-[var(--muted)]" />
            إمكانية الوصول
          </h4>
          
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--text)]">تقليل الحركة</p>
              <p className="text-xs text-[var(--muted)]">إيقاف التأثيرات الحركية والانتقالات</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={reduceMotion}
                onChange={(e) => setReduceMotion(e.target.checked)}
              />
              <div className="w-11 h-6 bg-[var(--surface)] peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[var(--primary)]/20 rounded-full peer peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-[var(--card)] after:border-[var(--border)] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--primary)]"></div>
            </label>
          </div>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-4 pt-2 border-b border-[var(--border)] pb-6 theme-transition">
          <h4 className="text-sm font-medium text-[var(--text)] flex items-center gap-2">
            <Lock className="h-4 w-4 text-[var(--muted)]" />
            تغيير كلمة المرور
          </h4>
          
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text)] mb-1">كلمة المرور الجديدة</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                placeholder="8 أحرف على الأقل"
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text)] mb-1">تأكيد كلمة المرور</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                placeholder="تأكيد كلمة المرور الجديدة"
                dir="ltr"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isChangingPassword || !newPassword || !confirmPassword}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-hover)] disabled:opacity-50"
          >
            {isChangingPassword ? 'جاري التحديث...' : 'تحديث كلمة المرور'}
          </button>
        </form>

        <div className="pt-2">
          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
          >
            <LogOut className="h-5 w-5" />
            تسجيل الخروج
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm space-y-6 theme-transition">
        <div className="flex items-center gap-3 border-b border-[var(--border)] pb-4 theme-transition">
          <div className="rounded-lg bg-[var(--primary)]/10 p-2 text-[var(--primary)]">
            <Clock className="h-5 w-5" />
          </div>
          <h3 className="text-lg font-semibold text-[var(--text)]">أوقات الحصص</h3>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-[var(--text)]">عدد الحصص في اليوم</label>
            <select
              value={slotsCount}
              onChange={(e) => setSlotsCount(Number(e.target.value))}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] px-3 py-1.5 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
            >
              {[...Array(12)].map((_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {[...Array(slotsCount)].map((_, i) => {
              const slotNum = i + 1;
              return (
                <div key={slotNum} className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 theme-transition">
                  <span className="text-sm font-medium text-[var(--text)]">الحصة {slotNum}</span>
                  <input
                    type="time"
                    value={localSlots[slotNum] || '08:00'}
                    onChange={(e) => handleTimeChange(slotNum, e.target.value)}
                    className="rounded-md border border-[var(--border)] bg-[var(--card)] text-[var(--text)] px-2 py-1 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                    dir="ltr"
                  />
                </div>
              );
            })}
          </div>

          <button
            onClick={handleSaveSlots}
            disabled={isSaving}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-hover)] disabled:opacity-50"
          >
            <Save className="h-5 w-5" />
            {isSaving ? 'جاري الحفظ...' : 'حفظ أوقات الحصص'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
