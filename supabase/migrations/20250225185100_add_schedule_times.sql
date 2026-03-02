/*
  # Add start_time and end_time to weekly_schedule

  1. Changes
    - Add `start_time` (time) column to `weekly_schedule` table
    - Add `end_time` (time) column to `weekly_schedule` table
*/

ALTER TABLE weekly_schedule 
ADD COLUMN IF NOT EXISTS start_time time,
ADD COLUMN IF NOT EXISTS end_time time;
