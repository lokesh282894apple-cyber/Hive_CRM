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

## Website lead webhook

`POST /api/leads/website` (public) — body JSON with `name`, `phone`, optional `email`, `course_id`, `cohort_id`, etc. Round-robins among counselors scoped to that course/cohort.

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

- WhatsApp: `/messages` placeholder only
- Attention rules: provisional thresholds in `app_settings`
- Installment cadence: `days_between_installments` (default 30)
- Marketing Box tab: placeholder

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run db:migrate` | Apply SQL migration (needs `DATABASE_URL` or prints instructions) |
| `npm run seed:admin` | Upsert admin auth + profile |
| `npm run seed:mock` | Courses, cohorts, counselor, interviewer, sample leads, availability |
| `npm run google:oauth` | One-time OAuth to print `GOOGLE_REFRESH_TOKEN` for Meet |
