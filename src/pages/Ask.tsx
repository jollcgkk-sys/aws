import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Task, Subject, WeeklySchedule, DayNote } from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import { queueMutation } from '../lib/sync';
import { uuid } from '../lib/uuid';
import { Search, Send, Sparkles, Loader2 } from 'lucide-react';
import TaskCard from '../components/TaskCard';
import TaskDialog from '../components/TaskDialog';
import { startOfWeek, addDays, format, getISODay } from 'date-fns';
import { supabase } from '../lib/supabase';

export default function Ask() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ tasks: Task[], schedule: WeeklySchedule[], notes: DayNote[] } | null>(null);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>(undefined);

  const tasks = useLiveQuery(() => db.tasks.where('user_id').equals(user?.id || '').toArray(), [user?.id]) || [];
  const subjects = useLiveQuery(() => db.subjects.where('user_id').equals(user?.id || '').toArray(), [user?.id]) || [];
  const schedule = useLiveQuery(() => db.weekly_schedule.where('user_id').equals(user?.id || '').toArray(), [user?.id]) || [];
  const notes = useLiveQuery(() => db.day_notes.where('user_id').equals(user?.id || '').toArray(), [user?.id]) || [];

  const subjectMap = subjects.reduce((acc, sub) => {
    acc[sub.id] = sub;
    return acc;
  }, {} as Record<string, Subject>);

  const handleToggleDone = async (id: string, isDone: boolean) => {
    if (!user) return;
    const task = await db.tasks.get(id);
    if (task) {
      const updated = { ...task, is_done: isDone, updated_at: new Date().toISOString() };
      await queueMutation('update_task', updated, user.id);
      if (results) {
        setResults({
          ...results,
          tasks: results.tasks.map(t => t.id === id ? updated : t)
        });
      }
    }
  };

  const handleToggleImportant = async (id: string, isImportant: boolean) => {
    if (!user) return;
    const task = await db.tasks.get(id);
    if (task) {
      const updated = { ...task, is_important: isImportant, updated_at: new Date().toISOString() };
      await queueMutation('update_task', updated, user.id);
      if (results) {
        setResults({
          ...results,
          tasks: results.tasks.map(t => t.id === id ? updated : t)
        });
      }
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!user) return;
    await queueMutation('delete_task', { id }, user.id);
    if (results) {
      setResults({
        ...results,
        tasks: results.tasks.filter(t => t.id !== id)
      });
    }
  };

  const handleTaskSubmit = async (taskData: Partial<Task>) => {
    if (!user) return;

    if (editingTask) {
      const updated = { ...editingTask, ...taskData, updated_at: new Date().toISOString() };
      await queueMutation('update_task', updated, user.id);
      if (results) {
        setResults({
          ...results,
          tasks: results.tasks.map(t => t.id === updated.id ? updated : t)
        });
      }
    } else {
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
      if (results) {
        setResults({
          ...results,
          tasks: [newTask, ...results.tasks]
        });
      }
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setAiAnswer(null);
    setResults(null);

    try {
      console.log("ASK DEBUG user.id:", user?.id);
      console.log("ASK DEBUG tasks count:", tasks.length, tasks.slice(0,3));

      const context = `
      User's Subjects: ${JSON.stringify(subjects.map(s => ({ id: s.id, name: s.name })))}
      User's Tasks: ${JSON.stringify(tasks.map(t => ({ id: t.id, title: t.title, type: t.type, due_at: t.due_at, is_done: t.is_done, subject_id: t.subject_id })))}
      User's Schedule: ${JSON.stringify(schedule.map(s => ({ day_of_week: s.day_of_week, subject_id: s.subject_id })))}
      Current Date/Time: ${new Date().toISOString()}
      Current Day of Week: ${getISODay(new Date()) - 1} (0=Monday, 6=Sunday)
      `;

      const prompt = `
      You are a smart study planner assistant. The user is asking a question in Arabic.
      If the user is asking to see their schedule, tasks, or subjects, extract the relevant filters and provide a brief summary. Set isGeneralQuestion to false.
      If the user is asking a general study question, asking for advice, or greeting you, provide a helpful response. Set isGeneralQuestion to true.
      
      CRITICAL: For targetTypes, ONLY use the exact string values: 'prep', 'homework', 'project', 'subject_note'.
      CRITICAL: The Context below is the ONLY source of truth. Do NOT invent tasks, homework, or schedule items. If it's not in the Context, it doesn't exist.
      
      Context:
      ${context}

      User Question: ${query}
      `;

      const { data, error } = await supabase.functions.invoke('ask-gemini', {
        body: { prompt }
      });

      console.log("ASK DEBUG AI data:", data);

      if (error) {
        throw new Error(error.message || 'Failed to call edge function');
      }

      if (data) {
        const q = query.toLowerCase();
        const taskKeywords = ["واجب", "واجبات", "تحضير", "تحاضير", "مهام", "ماذا لدي", "وش عندي", "جدول", "مشروع", "ملاحظات"];
        if (taskKeywords.some(kw => q.includes(kw))) {
          data.isGeneralQuestion = false;
        }

        if (data.isGeneralQuestion) {
          // Show AI answer and don't show results section for general questions
          setAiAnswer(data.answer);
          setResults(null);
          return;
        }

        // Apply filters based on parsed intent
        let filteredTasks = tasks.filter(t => !t.is_done);
        let filteredSchedule: WeeklySchedule[] = [];
        let filteredNotes: DayNote[] = [];

        // Helper to normalize date
        const normalizeDateYYYYMMDD = (dateStr: string | null | undefined) => {
          if (!dateStr) return null;
          try {
            return format(new Date(dateStr), 'yyyy-MM-dd');
          } catch {
            return null;
          }
        };

        let targetTypes: string[] = data.targetTypes || [];
        // Handle if AI returns a single string by mistake
        if (data.targetType && typeof data.targetType === 'string') {
          targetTypes.push(data.targetType);
        }

        // Map any Arabic types returned by mistake
        const validTypes = ['prep', 'homework', 'project', 'subject_note'];
        targetTypes = targetTypes.map(t => {
           if (t.includes('تحضير')) return 'prep';
           if (t.includes('واجب')) return 'homework';
           if (t.includes('مشروع')) return 'project';
           if (t.includes('ملاحظ')) return 'subject_note';
           return t;
        }).filter(t => validTypes.includes(t));

        // Fallback to query text if AI missed it
        if (targetTypes.length === 0) {
           if (q.includes('تحضير') || q.includes('تحاضير')) targetTypes.push('prep');
           if (q.includes('واجب')) targetTypes.push('homework');
           if (q.includes('مشروع') || q.includes('مشاريع')) targetTypes.push('project');
           if (q.includes('ملاحظ')) targetTypes.push('subject_note');
        }

        let isAllTasks = data.isAllTasks || q.includes('كل المهام') || q.includes('المهام كلها');
        let isImportantOnly = data.isImportantOnly || q.includes('مهم');
        let isProjectsOnly = data.isProjectsOnly || q.includes('مشروع') || q.includes('مشاريع');
        
        if (isProjectsOnly && !targetTypes.includes('project')) {
          targetTypes.push('project');
        }

        let targetDay = data.targetDay;
        // Fallback for targetDay if AI missed it but user said "اليوم" or "غدا"
        if (targetDay === null || targetDay === undefined) {
           if (q.includes('اليوم')) targetDay = getISODay(new Date()) - 1;
           else if (q.includes('غدا') || q.includes('غدًا') || q.includes('باجر')) targetDay = getISODay(new Date()) % 7;
        } else {
           // AI might guess the day even if not explicitly mentioned. Verify if a day word was actually in the query.
           const dayWords = ['احد', 'أحد', 'اثنين', 'إثنين', 'ثلاثاء', 'اربعاء', 'أربعاء', 'خميس', 'جمعة', 'جمعه', 'سبت', 'يوم', 'غدا', 'غدًا', 'باجر', 'اليوم'];
           const hasDayWord = dayWords.some(w => q.includes(w));
           if (!hasDayWord && !q.includes('عندي') && !q.includes('لدي')) {
             targetDay = null; // Ignore AI's day guess if user didn't mention time
           }
        }

        let targetSubjectId = data.targetSubjectId;
        if (!targetSubjectId) {
          for (const sub of subjects) {
            const subName = sub.name.toLowerCase();
            const subNameNoAl = subName.startsWith('ال') ? subName.substring(2) : subName;
            if (q.includes(subName) || (subNameNoAl.length > 2 && q.includes(subNameNoAl))) {
              targetSubjectId = sub.id;
              break;
            }
          }
        }

        // 1. Day-based query logic
        if (targetDay !== null && targetDay !== undefined) {
          filteredSchedule = schedule.filter(s => s.day_of_week === targetDay);
          const scheduledSubjectsForDay = filteredSchedule.map(s => s.subject_id);
          
          const today = new Date();
          const currentDay = getISODay(today) - 1;
          let daysToAdd = targetDay - currentDay;
          if (daysToAdd < 0) daysToAdd += 7;
          const targetDate = addDays(today, daysToAdd);
          const targetDateString = format(targetDate, 'yyyy-MM-dd');

          filteredNotes = notes.filter(n => 
            n.note_date === targetDateString || n.day_of_week === targetDay
          );

          filteredTasks = filteredTasks.filter(t => {
            const isScheduledSubjectTask = t.subject_id && scheduledSubjectsForDay.includes(t.subject_id);
            const normalizedDueAt = normalizeDateYYYYMMDD(t.due_at);
            const isDueOnDay = normalizedDueAt === targetDateString;
            return isScheduledSubjectTask || isDueOnDay;
          });
        } 
        // 2. Subject-based query logic (no day specified)
        else if (targetSubjectId) {
          filteredTasks = filteredTasks.filter(t => t.subject_id === targetSubjectId);
          filteredSchedule = schedule.filter(s => s.subject_id === targetSubjectId);
        }
        // 3. General query logic (no day, no subject)
        else {
          // If it's a general query like "وش عندي" without "كل المهام", we default to today
          if (!isAllTasks && !isImportantOnly && !isProjectsOnly && targetTypes.length === 0) {
             targetDay = getISODay(new Date()) - 1;
             filteredSchedule = schedule.filter(s => s.day_of_week === targetDay);
             const scheduledSubjectsForDay = filteredSchedule.map(s => s.subject_id);
             
             const today = new Date();
             const currentDay = getISODay(today) - 1;
             let daysToAdd = targetDay - currentDay;
             if (daysToAdd < 0) daysToAdd += 7;
             const targetDate = addDays(today, daysToAdd);
             const targetDateString = format(targetDate, 'yyyy-MM-dd');

             filteredNotes = notes.filter(n => 
               n.note_date === targetDateString || n.day_of_week === targetDay
             );

             filteredTasks = filteredTasks.filter(t => {
               const isScheduledSubjectTask = t.subject_id && scheduledSubjectsForDay.includes(t.subject_id);
               const normalizedDueAt = normalizeDateYYYYMMDD(t.due_at);
               const isDueOnDay = normalizedDueAt === targetDateString;
               return isScheduledSubjectTask || isDueOnDay;
             });
          }
          // Else, it's a broad query, keep all undone tasks
        }

        // Apply secondary filters
        if (targetTypes.length > 0) {
          filteredTasks = filteredTasks.filter(t => targetTypes.includes(t.type));
        }
        if (isImportantOnly) {
          filteredTasks = filteredTasks.filter(t => t.is_important);
        }
        if (isProjectsOnly) {
          filteredTasks = filteredTasks.filter(t => t.type === 'project');
        }

        // Determine answer text based on REAL results
        let answerText = "";
        if (filteredTasks.length === 0 && filteredSchedule.length === 0 && filteredNotes.length === 0) {
          answerText = "لم أجد نتائج مطابقة في بياناتك.";
        } else {
          if (targetDay !== null) {
            const dayNames = ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];
            const todayId = getISODay(new Date()) - 1;
            const tomorrowId = getISODay(new Date()) % 7;
            let dayName = `يوم ${dayNames[targetDay]}`;
            if (targetDay === todayId) dayName = 'اليوم';
            else if (targetDay === tomorrowId) dayName = 'غداً';
            if (filteredTasks.length > 0) {
              answerText = `وجدت ${filteredTasks.length} مهام لك ${dayName}. ستجد التفاصيل أدناه.`;
            } else {
              answerText = `لا توجد مهام، لكن وجدت عناصر في جدولك أو ملاحظاتك ${dayName}. ستجد التفاصيل أدناه.`;
            }
          } else if (targetSubjectId !== null) {
            const subName = subjects.find(s => s.id === targetSubjectId)?.name || '';
            if (filteredTasks.length > 0) {
              answerText = `وجدت ${filteredTasks.length} مهام لمادة ${subName}. ستجد التفاصيل أدناه.`;
            } else {
              answerText = `لا توجد مهام، لكن وجدت عناصر في جدولك أو ملاحظاتك لمادة ${subName}. ستجد التفاصيل أدناه.`;
            }
          } else if (isImportantOnly) {
            answerText = `وجدت ${filteredTasks.length} مهام مهمة. ستجد التفاصيل أدناه.`;
          } else if (isProjectsOnly) {
            answerText = `وجدت ${filteredTasks.length} مشاريع. ستجد التفاصيل أدناه.`;
          } else {
            if (filteredTasks.length > 0) {
              answerText = `وجدت ${filteredTasks.length} مهام. ستجد التفاصيل أدناه.`;
            } else {
              answerText = `لا توجد مهام، لكن وجدت عناصر في جدولك أو ملاحظاتك. ستجد التفاصيل أدناه.`;
            }
          }
        }

        setAiAnswer(answerText);
        setResults({
          tasks: filteredTasks,
          schedule: filteredSchedule,
          notes: filteredNotes
        });
      }

    } catch (error: any) {
      console.error("Search Error:", error);
      fallbackSearch();
    } finally {
      setIsLoading(false);
    }
  };

  const fallbackSearch = () => {
    const q = query.toLowerCase();
    
    // Intent detection flags
    let isAllTasks = q.includes('كل المهام') || q.includes('المهام كلها') || q.includes('اعرض المهام');
    let isImportantOnly = q.includes('مهم') || q.includes('مهمة');
    let isProjectsOnly = q.includes('مشروع') || q.includes('مشاريع');
    
    // Simple NLP mapping for days (0=Monday, 6=Sunday)
    const daysMap: Record<string, number> = {
      'الاثنين': 0, 'الإثنين': 0, 'اثنين': 0,
      'الثلاثاء': 1, 'ثلاثاء': 1,
      'الاربعاء': 2, 'الأربعاء': 2, 'اربعاء': 2,
      'الخميس': 3, 'خميس': 3,
      'الجمعة': 4, 'الجمعه': 4, 'جمعة': 4,
      'السبت': 5, 'سبت': 5,
      'الاحد': 6, 'الأحد': 6, 'احد': 6,
      'اليوم': getISODay(new Date()) - 1,
      'غدا': getISODay(new Date()) % 7,
      'غدًا': getISODay(new Date()) % 7,
      'باجر': getISODay(new Date()) % 7,
    };

    const typesMap: Record<string, string> = {
      'تحضير': 'prep', 'تحاضير': 'prep',
      'واجب': 'homework', 'واجبات': 'homework',
      'مشروع': 'project', 'مشاريع': 'project',
      'ملاحظة': 'subject_note', 'ملاحظات': 'subject_note',
    };

    let targetDay: number | null = null;
    let targetType: string | null = null;
    let targetSubject: string | null = null;

    // Detect day
    for (const [key, val] of Object.entries(daysMap)) {
      if (q.includes(key)) {
        targetDay = val;
        break;
      }
    }

    // Detect type
    for (const [key, val] of Object.entries(typesMap)) {
      if (q.includes(key)) {
        targetType = val;
        break;
      }
    }

    // Detect subject
    for (const sub of subjects) {
      if (q.includes(sub.name.toLowerCase())) {
        targetSubject = sub.id;
        break;
      }
    }

    let filteredTasks = tasks.filter(t => !t.is_done);
    let filteredSchedule: WeeklySchedule[] = [];
    let filteredNotes: DayNote[] = [];

    // Helper to normalize date
    const normalizeDateYYYYMMDD = (dateStr: string | null | undefined) => {
      if (!dateStr) return null;
      try {
        return format(new Date(dateStr), 'yyyy-MM-dd');
      } catch {
        return null;
      }
    };

    // 1. Day-based query logic
    if (targetDay !== null) {
      filteredSchedule = schedule.filter(s => s.day_of_week === targetDay);
      const scheduledSubjectsForDay = filteredSchedule.map(s => s.subject_id);
      
      const today = new Date();
      const currentDay = getISODay(today) - 1;
      let daysToAdd = targetDay - currentDay;
      if (daysToAdd < 0) daysToAdd += 7;
      const targetDate = addDays(today, daysToAdd);
      const targetDateString = format(targetDate, 'yyyy-MM-dd');

      filteredNotes = notes.filter(n => 
        n.note_date === targetDateString || n.day_of_week === targetDay
      );

      filteredTasks = filteredTasks.filter(t => {
        const isScheduledSubjectTask = t.subject_id && scheduledSubjectsForDay.includes(t.subject_id);
        const normalizedDueAt = normalizeDateYYYYMMDD(t.due_at);
        const isDueOnDay = normalizedDueAt === targetDateString;
        return isScheduledSubjectTask || isDueOnDay;
      });
    } 
    // 2. Subject-based query logic (no day specified)
    else if (targetSubject !== null) {
      filteredTasks = filteredTasks.filter(t => t.subject_id === targetSubject);
      filteredSchedule = schedule.filter(s => s.subject_id === targetSubject);
    }
    // 3. General query logic (no day, no subject)
    else {
      // If it's a general query like "وش عندي" without "كل المهام", we default to today
      if (!isAllTasks && !isImportantOnly && !isProjectsOnly && !targetType) {
         targetDay = getISODay(new Date()) - 1;
         filteredSchedule = schedule.filter(s => s.day_of_week === targetDay);
         const scheduledSubjectsForDay = filteredSchedule.map(s => s.subject_id);
         
         const startOfCurrentWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
         const targetDate = addDays(startOfCurrentWeek, targetDay);
         const targetDateString = format(targetDate, 'yyyy-MM-dd');

         filteredNotes = notes.filter(n => 
           n.note_date === targetDateString || n.day_of_week === targetDay
         );

         filteredTasks = filteredTasks.filter(t => {
           const isScheduledSubjectTask = t.subject_id && scheduledSubjectsForDay.includes(t.subject_id);
           const normalizedDueAt = normalizeDateYYYYMMDD(t.due_at);
           const isDueOnDay = normalizedDueAt === targetDateString;
           return isScheduledSubjectTask || isDueOnDay;
         });
      }
      // Else, it's a broad query, keep all undone tasks
    }

    // Apply secondary filters
    if (targetType) {
      filteredTasks = filteredTasks.filter(t => t.type === targetType);
    }
    if (isImportantOnly) {
      filteredTasks = filteredTasks.filter(t => t.is_important);
    }
    if (isProjectsOnly) {
      filteredTasks = filteredTasks.filter(t => t.type === 'project');
    }

    // Determine answer text
    let answerText = "";
    if (filteredTasks.length === 0 && filteredSchedule.length === 0 && filteredNotes.length === 0) {
      answerText = "لم أجد نتائج مطابقة في بياناتك.";
    } else {
      if (targetDay !== null) {
        const dayNames = ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];
        const todayId = getISODay(new Date()) - 1;
        const tomorrowId = getISODay(new Date()) % 7;
        let dayName = `يوم ${dayNames[targetDay]}`;
        if (targetDay === todayId) dayName = 'اليوم';
        else if (targetDay === tomorrowId) dayName = 'غداً';
        if (filteredTasks.length > 0) {
          answerText = `وجدت ${filteredTasks.length} مهام لك ${dayName}. ستجد التفاصيل أدناه.`;
        } else {
          answerText = `لا توجد مهام، لكن وجدت عناصر في جدولك أو ملاحظاتك ${dayName}. ستجد التفاصيل أدناه.`;
        }
      } else if (targetSubject !== null) {
        const subName = subjects.find(s => s.id === targetSubject)?.name || '';
        if (filteredTasks.length > 0) {
          answerText = `وجدت ${filteredTasks.length} مهام لمادة ${subName}. ستجد التفاصيل أدناه.`;
        } else {
          answerText = `لا توجد مهام، لكن وجدت عناصر في جدولك أو ملاحظاتك لمادة ${subName}. ستجد التفاصيل أدناه.`;
        }
      } else if (isImportantOnly) {
        answerText = `وجدت ${filteredTasks.length} مهام مهمة. ستجد التفاصيل أدناه.`;
      } else if (isProjectsOnly) {
        answerText = `وجدت ${filteredTasks.length} مشاريع. ستجد التفاصيل أدناه.`;
      } else {
        if (filteredTasks.length > 0) {
          answerText = `وجدت ${filteredTasks.length} مهام. ستجد التفاصيل أدناه.`;
        } else {
          answerText = `لا توجد مهام، لكن وجدت عناصر في جدولك أو ملاحظاتك. ستجد التفاصيل أدناه.`;
        }
      }
    }

    setAiAnswer(answerText);
    setResults({
      tasks: filteredTasks,
      schedule: filteredSchedule,
      notes: filteredNotes
    });
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="mb-4 rounded-full bg-[var(--primary)]/10 p-4 text-[var(--primary)]">
          <Sparkles className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-bold text-[var(--text)]">اسأل المساعد الذكي</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          اكتب سؤالك باللغة العربية، مثل: "ماذا لدي غداً؟" أو "هل لدي واجبات في الرياضيات؟"
        </p>
      </div>

      <form onSubmit={handleSearch} className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="اسأل هنا..."
          disabled={isLoading}
          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] py-4 pl-14 pr-6 text-lg shadow-sm focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 disabled:opacity-70"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="absolute left-3 top-1/2 -translate-y-1/2 rounded-xl bg-[var(--primary)] p-2 text-white hover:bg-[var(--primary)]/90 disabled:opacity-70"
        >
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 rotate-180" />}
        </button>
      </form>

      {aiAnswer && (
        <div className="rounded-2xl bg-[var(--primary)]/10 border border-[var(--primary)]/20 p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="mt-1 rounded-full bg-[var(--primary)]/20 p-2 text-[var(--primary)]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--primary)] mb-1">المساعد الذكي</h3>
              <p className="text-[var(--text)] leading-relaxed whitespace-pre-wrap">{aiAnswer}</p>
            </div>
          </div>
        </div>
      )}

      {results && (
        <div className="space-y-6 pt-2">
          <h3 className="text-lg font-semibold text-[var(--text)] border-b border-[var(--border)] pb-2">
            نتائج البحث
          </h3>

          {results.schedule.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium text-[var(--text)]">الجدول الدراسي</h4>
              <div className="flex flex-wrap gap-2">
                {results.schedule.map(s => {
                  const sub = subjectMap[s.subject_id];
                  return sub ? (
                    <span key={s.id} className="rounded-lg px-3 py-1.5 text-sm font-medium text-white" style={{ backgroundColor: sub.color }}>
                      {sub.name}
                    </span>
                  ) : null;
                })}
              </div>
            </div>
          )}

          {results.tasks.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium text-[var(--text)]">المهام</h4>
              <div className="grid gap-4">
                {results.tasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    subject={task.subject_id ? subjectMap[task.subject_id] : undefined}
                    onToggleDone={handleToggleDone}
                    onToggleImportant={handleToggleImportant}
                    onDelete={handleDeleteTask}
                    onEdit={(t) => {
                      setEditingTask(t);
                      setIsTaskDialogOpen(true);
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {results.notes.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium text-[var(--text)]">الملاحظات</h4>
              <div className="grid gap-4">
                {results.notes.map(note => (
                  <div key={note.id} className="rounded-xl border border-[var(--border)] bg-amber-50/50 p-4">
                    {note.title && <h5 className="font-semibold text-[var(--text)] mb-1">{note.title}</h5>}
                    <p className="text-sm text-[var(--text-secondary)]">{note.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {results.tasks.length === 0 && results.schedule.length === 0 && results.notes.length === 0 && (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] py-12 text-center">
              <p className="text-[var(--muted)]">لم يتم العثور على نتائج مطابقة لسؤالك.</p>
            </div>
          )}
        </div>
      )}

      <TaskDialog
        isOpen={isTaskDialogOpen}
        onClose={() => setIsTaskDialogOpen(false)}
        onSubmit={handleTaskSubmit}
        initialData={editingTask}
        subjects={subjects}
      />
    </div>
  );
}
