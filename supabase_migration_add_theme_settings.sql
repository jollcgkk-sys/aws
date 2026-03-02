ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS theme_key text DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS reduce_motion boolean NOT NULL DEFAULT false;

-- Ensure RLS is enabled
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
