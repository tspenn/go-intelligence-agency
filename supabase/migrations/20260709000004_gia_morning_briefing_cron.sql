/*
  # GIA — Schedule morning-briefing-gia Edge Function via pg_cron

  Runs daily at 13:00 UTC (9 am ET) for Agency tier users.
  Only sends if the user had at least one alert in the past 24 hours.
  Job name: gia-morning-briefing — distinct from any My Secret Agent jobs.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'gia-morning-briefing'
  ) THEN
    PERFORM cron.schedule(
      'gia-morning-briefing',
      '0 13 * * *',
      $$
      SELECT net.http_post(
        url     := 'https://psbdjnqcjpxapypcfigx.supabase.co/functions/v1/morning-briefing-gia',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body    := '{"source":"cron"}'::jsonb
      )
      $$
    );
  END IF;
END
$$;
