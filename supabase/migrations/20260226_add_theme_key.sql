-- Add theme_key to user_settings table
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS theme_key text NOT NULL DEFAULT 'default';
