# GigAlertPro – Production Setup Guide

This guide walks you through connecting your app to Supabase so it scans Reddit for freelance gigs 24/7 — **no Reddit API key or OAuth required**.

The scanner uses Reddit's **public JSON endpoints** (`/new.json`) which are free, require zero credentials, and return the same post data the website shows. Built-in back-off, jitter, and polite delays keep things smooth.

---

## 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in (or create a free account).
2. Click **New Project**, choose a name and region, and set a database password.
3. Once the project is ready, go to **Settings → API** and copy:
   - **Project URL** (e.g. `https://abc123.supabase.co`)
   - **anon / public** key

4. Create a `.env` file in the project root (copy from `.env.example`):

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

---

## 2. Run the Database Schema

1. In your Supabase Dashboard, go to **SQL Editor**.
2. Click **New Query**, paste the entire contents of `supabase/schema.sql`, and click **Run**.
3. This creates all tables, RLS policies, indexes, triggers, and seeds the scanner state.

**Verify:** Go to **Table Editor** — you should see tables: `profiles`, `keywords`, `gig_alerts`, `user_alerts`, `proposals`, `scanner_state`.

---

## 3. Enable Realtime

1. Go to **Database → Replication** in the Supabase Dashboard.
2. Under "Supabase Realtime", make sure the tables `user_alerts` and `gig_alerts` are enabled.
   (The schema already runs `ALTER PUBLICATION supabase_realtime ADD TABLE ...` but verify it took effect.)

---

## 4. Deploy the Reddit Scanner Edge Function

The scanner fetches public Reddit JSON — **no API key, no OAuth, no Reddit account needed**.

### Option A: Supabase CLI (Recommended)

Install the Supabase CLI if you haven't:

```bash
npm install -g supabase
```

Link your project:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

Deploy the function (no secrets needed!):

```bash
supabase functions deploy scan-reddit --no-verify-jwt
```

### Option B: Dashboard

1. Go to **Edge Functions** in the Supabase Dashboard.
2. Create a new function named `scan-reddit`.
3. Paste the contents of `supabase/functions/scan-reddit/index.ts`.
4. No extra secrets are required — the function uses public endpoints.

---

## 5. Schedule the Scanner (pg_cron)

The scanner needs to run automatically every **2 minutes**. Use Supabase's `pg_cron` extension:

1. Go to **Database → Extensions** and enable **pg_cron** if not already enabled.
2. Go to **SQL Editor** and run:

```sql
-- Run the scanner every 2 minutes
SELECT cron.schedule(
  'scan-reddit-every-2min',
  '*/2 * * * *',  -- every 2 minutes
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/scan-reddit',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::JSONB,
    body := '{}'::JSONB
  );
  $$
);
```

> Replace `YOUR_PROJECT_REF` with your project reference (from Settings → General).
> Replace `YOUR_SERVICE_ROLE_KEY` with the **service_role** key from Settings → API.

**Important:** The `net` extension must also be enabled. Go to **Database → Extensions** and enable **pg_net**.

To verify it's working, check Edge Function logs: **Edge Functions → scan-reddit → Logs**.

---

## 6. Run the App Locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`, sign up, add keywords, and wait for the scanner to find matching Reddit posts.

### Demo mode (skip signing in)

If you want to run the app locally without creating accounts, enable demo mode by adding the following to your `.env` file:

```
VITE_DISABLE_AUTH=true
```

In demo mode the app uses localStorage and sample data so you can test the UI without signing in. This is intended for development only.

---

## Architecture Overview

```
┌─────────────┐     pg_cron (every 2 min)   ┌──────────────────┐
│  Supabase   │ ──────────────────────────→  │  Edge Function   │
│  Database   │ ←────── inserts ────────────  │  scan-reddit     │
│             │                               │  (Deno runtime)  │
│  profiles   │     ┌───────────────┐         │                  │
│  keywords   │     │  reddit.com   │ ←──────│  public /new.json│
│  gig_alerts │     │  /r/new.json  │         └──────────────────┘
│  user_alerts│     └───────────────┘
│  proposals  │       No API key needed!
│  scanner_st │
└──────┬──────┘
       │ Realtime (WebSocket)
       ▼
┌─────────────┐
│  React App  │  reads alerts, manages keywords,
│  (Vite)     │  gets live notifications via Realtime
└─────────────┘
```

**Flow:**

1. Users sign up and add keywords (e.g. "react developer", "logo design").
2. Every 2 minutes, `pg_cron` invokes the `scan-reddit` Edge Function.
3. The function fetches the latest 25 posts from 6 subreddits using public JSON (no API key).
4. It matches post titles + body text against all user keywords.
5. Matching posts are inserted into `gig_alerts`; per-user entries go into `user_alerts`.
6. The React app subscribes to `user_alerts` via Supabase Realtime — new matches trigger a notification badge instantly.

> **Note:** The scanner uses a 2-second delay (+random jitter) between subreddits and exponential back-off on 429/5xx errors. This keeps total requests well under Reddit's public endpoint limits (~6 requests per scan cycle).

---

## Troubleshooting

| Problem              | Solution                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No gigs showing up   | Check Edge Function logs. Verify pg_cron is running. Try invoking manually: `curl -X POST https://PROJECT.supabase.co/functions/v1/scan-reddit -H "Authorization: Bearer SERVICE_ROLE_KEY"` |
| Auth not working     | Make sure `.env` has correct `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.                                                                                                              |
| RLS errors           | Run the full `schema.sql` again — policies may not have been created.                                                                                                                       |
| Realtime not working | Verify `user_alerts` and `gig_alerts` are in the Realtime publication (Database → Replication).                                                                                             |
| Reddit 429 errors    | The scanner auto-retries with exponential back-off. If persistent, increase `INTER_SUB_DELAY_MS` in `index.ts` or change cron to `*/3` (every 3 min).                                       |
| Matches delayed      | Normal — new matches can take up to ~2-4 minutes to appear depending on scan cycle timing.                                                                                                  |
