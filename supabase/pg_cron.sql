-- Schedule the `scan-reddit` Edge Function via pg_cron every 2 minutes
-- IMPORTANT: Do NOT commit your service_role key into the repo.
-- Replace YOUR_SERVICE_ROLE_KEY below when you run this in the Supabase SQL editor.

-- Requirements:
-- 1) Enable extensions `pg_cron` and `pg_net` in the Supabase Dashboard (Database → Extensions)
-- 2) Open SQL Editor and run this file (replace placeholders)

/*
-- Optional: enable extensions via SQL (you can also enable in UI)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
*/

-- Schedule: every 2 minutes. Replace YOUR_PROJECT_REF and YOUR_SERVICE_ROLE_KEY
SELECT cron.schedule(
  'scan-reddit-every-2min',
  '*/2 * * * *',  -- every 2 minutes
  $$
  SELECT net.http_post(
    url := 'https://ftwuqrqjptnhsazcyjzg.supabase.co/functions/v1/scan-reddit',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::JSONB,
    body := '{}'::JSONB
  );
  $$
);

-- To schedule every 1 minute instead, change the cron expression to '*/1 * * * *'
