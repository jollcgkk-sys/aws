import Dexie, { type Table } from 'dexie';

export interface Subject {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
  sync_status?: 'synced' | 'pending';
}

export interface Task {
  id: string;
  user_id: string;
  subject_id?: string | null;
  type: 'prep' | 'homework' | 'project' | 'subject_note';
  title: string;
  details: string;
  due_at?: string | null;
  remind_at?: string | null;
  is_done: boolean;
  is_important: boolean;
  created_at: string;
  updated_at: string;
  sync_status?: 'synced' | 'pending';
}

export interface WeeklySchedule {
  id: string;
  user_id: string;
  day_of_week: number;
  slot: number;
  subject_id: string;
  start_time?: string | null;
  end_time?: string | null;
  sync_status?: 'synced' | 'pending';
}

export interface DayNote {
  id: string;
  user_id: string;
  day_of_week?: number | null;
  note_date?: string | null;
  title?: string | null;
  content: string;
  remind_at?: string | null;
  created_at: string;
  updated_at: string;
  sync_status?: 'synced' | 'pending';
}

export interface SlotTime {
  id: string;
  user_id: string;
  slot: number;
  start_time: string;
  updated_at: string;
  sync_status?: 'synced' | 'pending';
}

export type ThemeKey = 'default' | 'cats_night' | 'pink_cute' | 'sandy_cat';

export interface UserSettings {
  user_id: string;
  slot_count: number;
  theme_key?: ThemeKey;
  reduce_motion?: boolean;
  updated_at: string;
  sync_status?: 'synced' | 'pending';
}

export interface PendingMutation {
  id: string; // uuid
  user_id: string;
  type: string; // 'create_task', 'update_task', 'delete_task', etc.
  payload: any;
  created_at: string;
  retry_count?: number;
  last_error?: string;
  status?: 'pending' | 'failed';
  last_attempt_at?: number;
}

export class StudyPlannerDB extends Dexie {
  subjects!: Table<Subject, string>;
  tasks!: Table<Task, string>;
  weekly_schedule!: Table<WeeklySchedule, string>;
  day_notes!: Table<DayNote, string>;
  slot_times!: Table<SlotTime, string>;
  pending_mutations!: Table<PendingMutation, string>;
  user_settings!: Table<UserSettings, string>;

  constructor() {
    super('StudyPlannerDB');
    this.version(1).stores({
      subjects: 'id, user_id, sync_status',
      tasks: 'id, user_id, subject_id, type, due_at, is_done, is_important, sync_status',
      weekly_schedule: 'id, user_id, day_of_week, subject_id, sync_status',
      day_notes: 'id, user_id, day_of_week, note_date, sync_status',
      pending_mutations: 'id, user_id, type, created_at'
    });
    this.version(2).stores({
      subjects: 'id, user_id, sync_status',
      tasks: 'id, user_id, subject_id, type, due_at, is_done, is_important, sync_status',
      weekly_schedule: 'id, user_id, day_of_week, subject_id, sync_status',
      day_notes: 'id, user_id, day_of_week, note_date, sync_status',
      slot_times: 'id, user_id, slot, sync_status',
      pending_mutations: 'id, user_id, type, created_at'
    });
    this.version(3).stores({
      subjects: 'id, user_id, sync_status',
      tasks: 'id, user_id, subject_id, type, due_at, is_done, is_important, sync_status',
      weekly_schedule: 'id, user_id, day_of_week, subject_id, sync_status',
      day_notes: 'id, user_id, day_of_week, note_date, sync_status',
      slot_times: 'id, user_id, slot, sync_status',
      pending_mutations: 'id, user_id, type, created_at, status'
    });
    this.version(4).stores({
      subjects: 'id, user_id, sync_status',
      tasks: 'id, user_id, subject_id, type, due_at, is_done, is_important, sync_status',
      weekly_schedule: 'id, user_id, day_of_week, subject_id, sync_status',
      day_notes: 'id, user_id, day_of_week, note_date, sync_status',
      slot_times: 'id, user_id, slot, sync_status',
      pending_mutations: 'id, user_id, type, created_at, status',
      user_settings: 'user_id, sync_status'
    });
    this.version(5).stores({
      subjects: 'id, user_id, sync_status',
      tasks: 'id, user_id, subject_id, type, due_at, is_done, is_important, sync_status',
      weekly_schedule: 'id, user_id, day_of_week, subject_id, sync_status',
      day_notes: 'id, user_id, day_of_week, note_date, sync_status',
      slot_times: 'id, user_id, slot, sync_status',
      pending_mutations: 'id, user_id, type, created_at, status',
      user_settings: 'user_id, sync_status'
    });
    this.version(6).stores({
      subjects: 'id, user_id, sync_status',
      tasks: 'id, user_id, subject_id, type, due_at, is_done, is_important, sync_status',
      weekly_schedule: 'id, user_id, day_of_week, subject_id, sync_status',
      day_notes: 'id, user_id, day_of_week, note_date, sync_status',
      slot_times: 'id, user_id, slot, sync_status',
      pending_mutations: 'id, user_id, type, created_at, status',
      user_settings: 'user_id, sync_status'
    });
    this.version(7).stores({
      subjects: 'id, user_id, sync_status',
      tasks: 'id, user_id, subject_id, type, due_at, is_done, is_important, sync_status',
      weekly_schedule: 'id, user_id, day_of_week, subject_id, sync_status',
      day_notes: 'id, user_id, day_of_week, note_date, sync_status',
      slot_times: 'id, user_id, slot, sync_status',
      pending_mutations: 'id, user_id, type, created_at, status, retry_count',
      user_settings: 'user_id, sync_status'
    });
    this.version(8).stores({
      subjects: 'id, user_id, sync_status',
      tasks: 'id, user_id, subject_id, type, due_at, is_done, is_important, sync_status',
      weekly_schedule: 'id, user_id, day_of_week, subject_id, sync_status',
      day_notes: 'id, user_id, day_of_week, note_date, sync_status',
      slot_times: 'id, user_id, slot, sync_status',
      pending_mutations: 'id, user_id, type, created_at, status, retry_count, last_attempt_at',
      user_settings: 'user_id, sync_status'
    });
  }
}

export const db = new StudyPlannerDB();

