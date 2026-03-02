import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, BookOpen, Zap } from 'lucide-react';
import { Task, Subject, WeeklySchedule, SlotTime } from '../lib/db';
import { sanitizeDetails } from '../lib/utils';
import { format, addDays, startOfDay, addHours, addMinutes, setHours, setMinutes, parseISO, getISODay } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { modalIn } from '../lib/motion';

interface QuickAddDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (task: Partial<Task>) => void;
  subjects: Subject[];
  schedule: WeeklySchedule[];
  slotTimes: SlotTime[];
  defaultSubjectId?: string;
}

type TimingOption = 'next_class' | 'today' | 'tomorrow' | 'manual';

function parseArabicQuickAdd(text: string, subjects: Subject[]) {
  let type: 'prep' | 'homework' | 'project' | null = null;
  let subjectId: string | null = null;
  let timingMode: TimingOption | null = null;
  let extractedDetails = text;

  // Detect type
  if (text.includes('تحضير')) {
    type = 'prep';
    extractedDetails = extractedDetails.replace('تحضير', '').trim();
  } else if (text.includes('واجب')) {
    type = 'homework';
    extractedDetails = extractedDetails.replace('واجب', '').trim();
  } else if (text.includes('مشروع')) {
    type = 'project';
    extractedDetails = extractedDetails.replace('مشروع', '').trim();
  }

  // Detect timing
  if (text.includes('الحصة القادمة') || text.includes('الدرس القادم')) {
    timingMode = 'next_class';
    extractedDetails = extractedDetails.replace(/الحصة القادمة|الدرس القادم/g, '').trim();
  } else if (text.includes('اليوم')) {
    timingMode = 'today';
    extractedDetails = extractedDetails.replace('اليوم', '').trim();
  } else if (text.includes('غدا') || text.includes('غدًا') || text.includes('بكرة')) {
    timingMode = 'tomorrow';
    extractedDetails = extractedDetails.replace(/غدًا|غدا|بكرة/g, '').trim();
  }

  // Detect subject
  for (const sub of subjects) {
    if (text.includes(sub.name)) {
      subjectId = sub.id;
      extractedDetails = extractedDetails.replace(sub.name, '').trim();
      break;
    }
  }

  // Clean up common filler words
  extractedDetails = extractedDetails.replace(/مادة|عن|لـ|في/g, '').replace(/\s+/g, ' ').trim();

  return { type, subjectId, timingMode, details: extractedDetails };
}

export default function QuickAddDialog({
  isOpen,
  onClose,
  onSubmit,
  subjects,
  schedule,
  slotTimes,
  defaultSubjectId
}: QuickAddDialogProps) {
  const [type, setType] = useState<'prep' | 'homework' | 'project'>('homework');
  const [subjectId, setSubjectId] = useState<string>(defaultSubjectId || '');
  const [timing, setTiming] = useState<TimingOption>('next_class');
  const [manualDate, setManualDate] = useState<string>('');
  const [details, setDetails] = useState('');
  
  // Lead times
  const [prepLeadHours, setPrepLeadHours] = useState(2);
  const [remindLeadMinutes, setRemindLeadMinutes] = useState(30);

  useEffect(() => {
    if (isOpen) {
      setType('homework');
      setSubjectId(defaultSubjectId || (subjects.length > 0 ? subjects[0].id : ''));
      setTiming('next_class');
      setManualDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
      setDetails('');
      setPrepLeadHours(2);
      setRemindLeadMinutes(30);
    }
  }, [isOpen, defaultSubjectId, subjects]);

  const handleDetailsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setDetails(text);
    const parsed = parseArabicQuickAdd(text, subjects);
    if (parsed.type) setType(parsed.type);
    if (parsed.subjectId) setSubjectId(parsed.subjectId);
    if (parsed.timingMode) setTiming(parsed.timingMode);
  };

  const computeNextOccurrence = (dayOfWeek: number, timeStr: string) => {
    const now = new Date();
    const [hours, minutes] = timeStr.split(':').map(Number);
    
    let targetDate = new Date(now);
    targetDate.setHours(hours, minutes, 0, 0);

    // Normalize today's day to Mon=0, Sun=6
    const currentDayNormalized = getISODay(now) - 1;
    
    // dayOfWeek is already Mon=0 from DB
    let daysToAdd = (dayOfWeek - currentDayNormalized + 7) % 7;
    
    // If it's today but the time has passed, next occurrence is next week
    if (daysToAdd === 0 && targetDate <= now) {
      daysToAdd = 7;
    }
    
    targetDate.setDate(now.getDate() + daysToAdd);
    return targetDate;
  };

  const calculateDueAndRemindDates = () => {
    let dueAt: Date | null = null;
    let remindAt: Date | null = null;
    const now = new Date();

    if (timing === 'manual') {
      dueAt = new Date(manualDate);
    } else if (timing === 'today') {
      dueAt = setMinutes(setHours(now, 23), 59);
    } else if (timing === 'tomorrow') {
      dueAt = setMinutes(setHours(addDays(now, 1), 23), 59);
    } else if (timing === 'next_class' && subjectId) {
      const subjectSchedule = schedule.filter(s => s.subject_id === subjectId);
      
      if (subjectSchedule.length > 0) {
        let earliest: Date | null = null;
        
        for (const slot of subjectSchedule) {
          let timeStr = slot.start_time;
          if (!timeStr) {
            const st = slotTimes.find(s => s.slot === slot.slot);
            if (st && st.start_time) {
              timeStr = st.start_time;
            } else {
              const defaults: Record<number, string> = {
                1: '08:30', 2: '10:30', 3: '12:30', 4: '14:30', 5: '16:30', 6: '18:30'
              };
              timeStr = defaults[slot.slot] || '08:30';
            }
          }
          
          const occurrence = computeNextOccurrence(slot.day_of_week, timeStr);
          if (!earliest || occurrence < earliest) {
            earliest = occurrence;
          }
        }
        dueAt = earliest;
      } else {
        // Fallback if not in schedule: tomorrow at 8 AM
        dueAt = setMinutes(setHours(addDays(now, 1), 8), 0);
      }
    }

    if (dueAt) {
      if (type === 'prep') {
        // For prep, remind X hours before class
        remindAt = addHours(dueAt, -prepLeadHours);
      } else {
        // For homework/project, remind X minutes before due time
        remindAt = addMinutes(dueAt, -remindLeadMinutes);
      }
    }

    return {
      due_at: dueAt ? dueAt.toISOString() : null,
      remind_at: remindAt ? remindAt.toISOString() : null,
    };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { due_at, remind_at } = calculateDueAndRemindDates();
    
    let titlePrefix = 'مهمة';
    if (type === 'prep') titlePrefix = 'تحضير';
    else if (type === 'homework') titlePrefix = 'واجب';
    else if (type === 'project') titlePrefix = 'مشروع';
    
    const subject = subjects.find(s => s.id === subjectId);
    const title = subject ? `${titlePrefix} ${subject.name}` : titlePrefix;

    const sanitizedDetails = sanitizeDetails(details);

    onSubmit({
      title: title,
      details: sanitizedDetails,
      type,
      subject_id: subjectId || null,
      due_at,
      remind_at,
      is_done: false,
      is_important: false
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[var(--primary)]/50 backdrop-blur-sm" 
            onClick={onClose} 
          />
          <motion.div 
            variants={modalIn}
            initial="initial"
            animate="animate"
            exit="exit"
            className="relative bg-[var(--card)] rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-[var(--border)] theme-transition" 
            dir="rtl"
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-[var(--primary)]/5">
              <div className="flex items-center gap-2 text-[var(--primary)]">
                <Zap className="h-5 w-5" />
                <h3 className="font-bold">إضافة سريعة ذكية</h3>
              </div>
              <button onClick={onClose} className="p-1 rounded-lg text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--text)] transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-[var(--text)]">تفاصيل / عنوان التحضير</label>
                <input
                  type="text"
                  value={details}
                  onChange={handleDetailsChange}
                  placeholder="مثال: تحضير عن الكواكب مادة انكليزي الحصة القادمة"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-[var(--text)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                />
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-medium text-[var(--text)]">نوع المهمة</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setType('prep')}
                    className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${type === 'prep' ? 'bg-[var(--primary)]/10 border-[var(--primary)]/30 text-[var(--primary)]' : 'bg-[var(--bg)] border-[var(--border)] text-[var(--muted)] hover:bg-[var(--card)]'}`}
                  >
                    تحضير
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('homework')}
                    className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${type === 'homework' ? 'bg-[var(--primary)]/10 border-[var(--primary)]/30 text-[var(--primary)]' : 'bg-[var(--bg)] border-[var(--border)] text-[var(--muted)] hover:bg-[var(--card)]'}`}
                  >
                    واجب
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('project')}
                    className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${type === 'project' ? 'bg-[var(--primary)]/10 border-[var(--primary)]/30 text-[var(--primary)]' : 'bg-[var(--bg)] border-[var(--border)] text-[var(--muted)] hover:bg-[var(--card)]'}`}
                  >
                    مشروع
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-[var(--text)]">المادة</label>
                <select
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  required
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-[var(--text)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                >
                  <option value="" disabled>اختر المادة...</option>
                  {subjects.map(sub => (
                    <option key={sub.id} value={sub.id}>{sub.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-[var(--text)]">التوقيت الذكي</label>
                <select
                  value={timing}
                  onChange={(e) => setTiming(e.target.value as TimingOption)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-[var(--text)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                >
                  <option value="next_class">الحصة القادمة لهذه المادة</option>
                  <option value="today">اليوم</option>
                  <option value="tomorrow">غدًا</option>
                  <option value="manual">اختيار يدوي</option>
                </select>
              </div>

              {timing === 'manual' && (
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-[var(--text)]">التاريخ والوقت</label>
                  <input
                    type="datetime-local"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    required
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-[var(--text)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                    dir="ltr"
                  />
                </div>
              )}

              {type === 'prep' && (
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[var(--border)]">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-[var(--muted)]">وقت التحضير (ساعات)</label>
                    <input
                      type="number"
                      min="1"
                      max="24"
                      value={prepLeadHours}
                      onChange={(e) => setPrepLeadHours(Number(e.target.value))}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-[var(--muted)]">تنبيه قبل (دقائق)</label>
                    <input
                      type="number"
                      min="5"
                      max="120"
                      step="5"
                      value={remindLeadMinutes}
                      onChange={(e) => setRemindLeadMinutes(Number(e.target.value))}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                    />
                  </div>
                </div>
              )}

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--card)]"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={!subjectId}
                  className="flex-1 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Zap className="h-4 w-4" />
                  إضافة ذكية
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
