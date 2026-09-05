-- Assets: keep a URL / article / development from an operative.
-- Comms: a note to self, filed under that operative's title.

CREATE TABLE IF NOT EXISTS public.gia_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id uuid REFERENCES public.secret_agent_missions(id) ON DELETE SET NULL,
  alert_id uuid,
  title text NOT NULL,
  url text,
  note text,
  operative_title text,
  source text NOT NULL DEFAULT 'finding',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gia_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id uuid REFERENCES public.secret_agent_missions(id) ON DELETE SET NULL,
  operative_title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gia_assets_alert_once
  ON public.gia_assets (user_id, alert_id)
  WHERE alert_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS gia_assets_user_recent
  ON public.gia_assets (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS gia_assets_by_mission
  ON public.gia_assets (user_id, mission_id, created_at DESC);

CREATE INDEX IF NOT EXISTS gia_notes_user_recent
  ON public.gia_notes (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS gia_notes_by_mission
  ON public.gia_notes (user_id, mission_id, created_at DESC);

ALTER TABLE public.gia_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gia_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gia_assets_own" ON public.gia_assets;
CREATE POLICY "gia_assets_own"
  ON public.gia_assets FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "gia_notes_own" ON public.gia_notes;
CREATE POLICY "gia_notes_own"
  ON public.gia_notes FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Let a person clear the report list on an operative without losing saved assets.
DROP POLICY IF EXISTS "saa_delete_own" ON public.secret_agent_alerts;
CREATE POLICY "saa_delete_own"
  ON public.secret_agent_alerts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gia_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gia_notes TO authenticated;
REVOKE ALL ON public.gia_assets FROM anon, public;
REVOKE ALL ON public.gia_notes FROM anon, public;
