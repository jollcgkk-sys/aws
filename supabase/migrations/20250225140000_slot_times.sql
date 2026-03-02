/*
  # Create slot_times table

  1. New Tables
    - `slot_times`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `slot` (integer, 1-12)
      - `start_time` (time)
      - `updated_at` (timestamptz)
  2. Security
    - Enable RLS on `slot_times` table
    - Add policies for authenticated users to manage their own slot times
*/

CREATE TABLE IF NOT EXISTS slot_times (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot integer NOT NULL CHECK (slot >= 1 AND slot <= 12),
  start_time time NOT NULL,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, slot)
);

ALTER TABLE slot_times ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own slot times"
  ON slot_times
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
