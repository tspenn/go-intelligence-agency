/*
  # GIA — Add webhook_url to secret_agent_missions

  Agency tier users can supply a webhook URL per operative.
  The mission-watcher fires a POST to this URL when the condition is met.
  Nullable — no webhook if not set.
*/

ALTER TABLE secret_agent_missions
  ADD COLUMN IF NOT EXISTS webhook_url text;

COMMENT ON COLUMN secret_agent_missions.webhook_url IS
  'Agency: optional HTTP endpoint to POST the alert payload to when condition fires.';
