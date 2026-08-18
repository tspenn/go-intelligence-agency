/*
  Recreate secret-agent-mission-watcher cron without an Authorization JWT.

  Bearer JWTs 401 at the Edge Function gateway before the handler runs, so
  missions never checked. Cron authenticates with x-cron-job instead.
  verify_jwt stays off on mission-watcher. Timeout 60s for news/price checks.

  Shared project — same job name as My Secret Agent (one watcher for both apps).
*/

SELECT cron.unschedule('secret-agent-mission-watcher');

SELECT cron.schedule(
  'secret-agent-mission-watcher',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://psbdjnqcjpxapypcfigx.supabase.co/functions/v1/mission-watcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-job', 'secret-agent-mission-watcher'
    ),
    body := '{"source":"cron"}'::jsonb,
    timeout_milliseconds := 60000
  )
  $$
);
