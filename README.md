# HiveSchool Admissions CRM

Role-based admissions CRM for HiveSchool: **Admin**, **Counselor**, and **Panel of Interviewer**. Students do not log in — they only receive emails (e.g. interview invites).

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind
- Supabase (Auth, Postgres, RLS)
- Design: HiveSchool navy `#060F32` / gold `#FFCF00` / periwinkle `#869DFF`, Outfit + Fraunces

## Setup

1. Copy env (already present as `.env.local` if continuing from prior work):

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SEED_ADMIN_EMAIL=
SEED_ADMIN_PASSWORD=
SEED_COUNSELOR_EMAIL=   # or legacy SEED_COUNSELLOR_EMAIL
SEED_COUNSELOR_PASSWORD=
SEED_INTERVIEWER_EMAIL=interviewer@hiveschool.in
SEED_INTERVIEWER_PASSWORD=Interviewer2026!
```

2. Apply the schema migration (replaces any old Phase-1 work-desk tables):

- Open [Supabase SQL Editor](https://supabase.com/dashboard) for your project
- Paste and run [`supabase/migrations/20260731000000_admissions_schema.sql`](supabase/migrations/20260731000000_admissions_schema.sql)

   Or set `DATABASE_URL` (Postgres connection string) and run `npm run db:migrate` after `npm install pg`.

3. Install & seed:

```bash
npm install
npm run seed:admin
npm run seed:mock
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) and sign in.

## Role homes

| Role | Home |
|------|------|
| Admin | `/admin/dashboard` |
| Counselor | `/dashboard` |
| Interviewer | `/interviewer/interviews` |
| Marketing | `/marketing/dashboard` |

## Marketing funnel

One system with Admissions — same Supabase project, auth, and design system. Client tracking lives on hiveschool.co (separate repo).

### Apply schema

Paste [`supabase/migrations/20260808120000_marketing_funnel_schema.sql`](supabase/migrations/20260808120000_marketing_funnel_schema.sql) in the Supabase SQL editor, or:

```bash
npm run db:migrate -- supabase/migrations/20260808120000_marketing_funnel_schema.sql
```

(Requires `DATABASE_URL` in `.env.local`.)

### Env

```bash
CRM_TRACK_API_KEY=   # Bearer token for POST /api/leads/website (and cron fallback)
CRON_SECRET=         # Bearer for Vercel Cron → /api/cron/*
NEXT_PUBLIC_APP_URL= # e.g. https://crm.hiveschool.co (tracked /go links)
```

### Public endpoints

| Route | Auth | Purpose |
|-------|------|---------|
| `POST /api/track/event` | None (CORS: hiveschool.co) | Pageview / click / scroll ingest |
| `GET /go/[slug]` | None | Tracked redirect → creative destination |
| `POST /api/leads/website` | Bearer `CRM_TRACK_API_KEY` (if set) | Form webhook + optional `session_id` → `lead_attribution` |

### Screens

| Route | Roles |
|-------|-------|
| `/marketing/dashboard` | marketing, admin |
| `/marketing/campaigns` | marketing, admin |
| `/marketing/heatmaps` | marketing, admin |
| `/admin/marketing/connections` | admin |
| `/leads/[id]?tab=marketing` | counselor / admin / marketing |

### Website prerequisites (hiveschool.co)

1. Embed tracking script (session cookie + events → `/api/track/event`).
2. Hidden `session_id` on admissions form → `/api/leads/website`.
3. Rewrite `/go/*` to this CRM’s `/go/[slug]`.
4. For readable Marketing Box presses, send `element_label` (or `element_text`) on click events — e.g. button/link text or `aria-label` — alongside `element_selector`.

Apply migration `supabase/migrations/20260812120000_page_events_element_label.sql` so `element_label` is stored.
## Website lead webhook

`POST /api/leads/website` — body JSON with `name`, `phone`, optional `email`, `course_id`, `cohort_id`, `session_id`, etc. Round-robins among counselors scoped to that course/cohort. When `session_id` matches a `visitor_sessions` row, inserts/updates `lead_attribution`.


## Google Calendar + Meet

Interview bookings create a real Google Calendar event (with Meet) on a **shared admissions calendar**.

1. In [Google Cloud Console](https://console.cloud.google.com/): create/select a project → enable **Google Calendar API**.
2. Create an **OAuth client** (Desktop app, or Web with redirect `http://127.0.0.1:53682/callback`).
3. Put Client ID + Secret in `.env.local`, then run:

```bash
npm run google:oauth
```

4. Sign in as the shared account (e.g. `admissions@hiveschool.in`), copy `GOOGLE_REFRESH_TOKEN` into `.env.local`.
5. Optionally set `GOOGLE_CALENDAR_ID` (default `primary`) and `GOOGLE_CALENDAR_TIMEZONE` (default `Asia/Kolkata`).
6. Restart `npm run dev`. Confirm status on **Admin → Config**.

On book/reschedule, the CRM invites the lead email (if present) and the interviewer, and stores `meet_link` + `calendar_event_id` on the booking.

## HubSpot → Hive cutover

Replace-only (no live sync):

1. Apply migration [`supabase/migrations/20260731120000_hubspot_id.sql`](supabase/migrations/20260731120000_hubspot_id.sql) in Supabase SQL Editor (adds `leads.hubspot_id`).
2. Create counselors in Admin → Users (emails should match HubSpot owner emails if you map Owner).
3. Export **open** contacts/deals from HubSpot as CSV.
4. Admin → Leads → **Import HubSpot CSV** → map columns + stages → Dry run → Import.
5. Re-import is safe: rows match on HubSpot ID or phone (update in place).
6. Flip the website form to `POST /api/leads/website`, then set HubSpot read-only.

## Provisional / deferred

- Attention rules: provisional thresholds in `app_settings`
- Installment cadence: `days_between_installments` (default 30)
- Ad platform spend sync: cron stub until Meta/Google/LinkedIn credentials are provided

## Integrations (Nikhil concept note)

Apply migration `supabase/migrations/20260825120000_integration_layer.sql`.

| Integration | Endpoints / UI | Env |
|---|---|---|
| Stage → WA + email | `dispatchStageTriggers` on stage/call/book; Admin → Config → WA + Email triggers; `/messages` | `AISENSY_API_KEY` or `META_WA_*`, `RESEND_API_KEY`, `EMAIL_FROM` |
| Meta Lead Ads | `GET/POST /api/leads/meta` | `META_WEBHOOK_VERIFY_TOKEN`, `META_PAGE_ACCESS_TOKEN` |
| Website intake | `POST /api/leads/website` (+ UTMs, touchpoints) | `CRM_TRACK_API_KEY` |
| SIM dialer | `POST /api/leads/sim-calls` | Same API key; parks unknown numbers |
| Twilio click-to-call | Lead Calling tab | `TWILIO_*`, `NEXT_PUBLIC_APP_URL` |
| Read AI | `POST /api/read-ai/webhook` | `READ_AI_WEBHOOK_SECRET` |
| Fee deadline cron | `/api/cron/integration-triggers` | `CRON_SECRET` |

Form mapping checklist: `docs/website-forms-audit.md`.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run db:migrate` | Apply SQL migration (needs `DATABASE_URL` or prints instructions) |
| `npm run seed:admin` | Upsert admin auth + profile |
| `npm run seed:mock` | Courses, cohorts, counselor, interviewer, sample leads, availability |
| `npm run google:oauth` | One-time OAuth to print `GOOGLE_REFRESH_TOKEN` for Meet |
