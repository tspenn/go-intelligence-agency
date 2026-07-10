/*
  # GIA — Schedule weekly-digest-gia Edge Function via pg_cron

  Runs Monday 02:00 UTC (= Sunday 10 pm ET) every week.
  Job name: gia-weekly-digest-sunday-night
  (different from My Secret Agent's weekly-digest-sunday-night to avoid conflicts)

  Prerequisites (already enabled on the shared project):
    - pg_cron extension
    - pg_net extension

  After running this migration, replace the two placeholder values:
    - YOUR_PROJECT_REF      → psbdjnqcjpxapypcfigx
    - YOUR_SERVICE_ROLE_KEY → from Dashboard → Settings → API → service_role key
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'gia-weekly-digest-sunday-night'
  ) THEN
    PERFORM cron.schedule(
      'gia-weekly-digest-sunday-night',
      '0 2 * * 1',
      $$
      SELECT net.http_post(
        url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/weekly-digest-gia',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
        ),
        body    := '{"source":"cron"}'::jsonb
      )
      $$
    );
  END IF;
END
$$;
