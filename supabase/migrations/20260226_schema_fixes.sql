/*
  # Fix schema for weekly_schedule and slot_times

  1. Changes
    - Add `start_time` (time) column to `weekly_schedule` table if missing
    - Add `end_time` (time) column to `weekly_schedule` table if missing
    - Create `slot_times` table if missing
    - Enable RLS on `slot_times`
    - Add policies for authenticated users to manage their own slot times
*/

-- 1. Update weekly_schedule
ALTER TABLE weekly_schedule 
ADD COLUMN IF NOT EXISTS start_time time,
ADD COLUMN IF NOT EXISTS end_time time;

-- 2. Create slot_times table
CREATE TABLE IF NOT EXISTS slot_times (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot integer NOT NULL CHECK (slot >= 1 AND slot <= 12),
  start_time time NOT NULL,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, slot)
);

-- 3. Enable RLS on slot_times
ALTER TABLE slot_times ENABLE ROW LEVEL SECURITY;

-- 4. Add RLS Policies for slot_times
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'slot_times' AND policyname = 'Users can manage their own slot times'
  ) THEN
    CREATE POLICY "Users can manage their own slot times"
      ON slot_times
      FOR ALL
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;
