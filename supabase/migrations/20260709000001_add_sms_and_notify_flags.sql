/*
  # GIA — SMS opt-in columns + per-mission notification flags

  1. public.profiles
     - Creates the table if it does not yet exist (My Secret Agent may have already created it)
     - Adds phone (text, nullable) and sms_enabled (boolean, default false) if absent

  2. secret_agent_missions
     - notify_push (boolean, default true)  — send web push when condition fires
     - notify_sms  (boolean, default false) — send Twilio SMS when condition fires

  All changes are additive / idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
*/

-- ─── profiles ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    CREATE TABLE public.profiles (
      id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      tier        text        NOT NULL DEFAULT 'operative',
      phone       text,
      sms_enabled boolean     NOT NULL DEFAULT false,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "profiles_select_own"
      ON public.profiles FOR SELECT
      TO authenticated USING (auth.uid() = id);

    CREATE POLICY "profiles_upsert_own"
      ON public.profiles FOR ALL
      TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

    CREATE POLICY "profiles_service"
      ON public.profiles FOR ALL
      TO service_role USING (true) WITH CHECK (true);
  ELSE
    -- Table already exists — just add the columns if absent
    ALTER TABLE public.profiles
      ADD COLUMN IF NOT EXISTS phone       text,
      ADD COLUMN IF NOT EXISTS sms_enabled boolean NOT NULL DEFAULT false;
  END IF;
END
$$;

-- ─── per-mission notification flags ──────────────────────────────────────────
ALTER TABLE secret_agent_missions
  ADD COLUMN IF NOT EXISTS notify_push boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_sms  boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN secret_agent_missions.notify_push IS
  'When true (default), fire a web push notification when this mission alerts.';

COMMENT ON COLUMN secret_agent_missions.notify_sms IS
  'When true, fire a Twilio SMS to the user''s saved phone number when this mission alerts.';
