-- Drop existing foreign keys if they exist (using common naming conventions)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'tasks_subject_id_fkey') THEN
        ALTER TABLE tasks DROP CONSTRAINT tasks_subject_id_fkey;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'weekly_schedule_subject_id_fkey') THEN
        ALTER TABLE weekly_schedule DROP CONSTRAINT weekly_schedule_subject_id_fkey;
    END IF;
END $$;

-- Recreate foreign keys with ON DELETE CASCADE
ALTER TABLE tasks
ADD CONSTRAINT tasks_subject_id_fkey
FOREIGN KEY (subject_id)
REFERENCES subjects(id)
ON DELETE CASCADE;

ALTER TABLE weekly_schedule
ADD CONSTRAINT weekly_schedule_subject_id_fkey
FOREIGN KEY (subject_id)
REFERENCES subjects(id)
ON DELETE CASCADE;
