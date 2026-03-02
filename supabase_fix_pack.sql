-- Create user_settings table if not exists
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  slot_count int DEFAULT 6 CHECK (slot_count >= 1 AND slot_count <= 12),
  theme_key text DEFAULT 'default',
  reduce_motion boolean DEFAULT false NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'user_settings' AND policyname = 'Users can view own user_settings'
    ) THEN
        CREATE POLICY "Users can view own user_settings"
          ON public.user_settings FOR SELECT
          USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'user_settings' AND policyname = 'Users can insert own user_settings'
    ) THEN
        CREATE POLICY "Users can insert own user_settings"
          ON public.user_settings FOR INSERT
          WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'user_settings' AND policyname = 'Users can update own user_settings'
    ) THEN
        CREATE POLICY "Users can update own user_settings"
          ON public.user_settings FOR UPDATE
          USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'user_settings' AND policyname = 'Users can delete own user_settings'
    ) THEN
        CREATE POLICY "Users can delete own user_settings"
          ON public.user_settings FOR DELETE
          USING (auth.uid() = user_id);
    END IF;
END
$$;
