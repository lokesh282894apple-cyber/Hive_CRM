# Deep test of the HiveSchool CRM — prompt for Cursor (Debug mode)

You are testing the HiveSchool Admissions CRM in this repo (Next.js 14 App Router + Supabase).
Your job is to FIND every wrong number, broken action, and confusing screen — the way the
admissions team would hit them — and prove each one with evidence. Fix only after the
evidence is written down.

## Ground rules (do not break these)
- Production database. **Read-only queries only.** Never INSERT/UPDATE/DELETE, never run
  migrations, never change Supabase policies. If a fix needs a data change, write a new SQL file
  in `supabase/migrations/` (idempotent, with a backup table) and stop — a human runs it.
- Never push, never deploy, never touch `.env*` values.
- Do **not** change Call Tracking metrics (`/marketing/calls`) — out of scope.
- Never drop or rewrite existing data. Never delete leads.
- Use `.env.local` (SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL) for read-only REST
  queries to compute ground truth. Business timezone is **IST** (UTC+5:30); a "day" is IST midnight
  to midnight. Server code runs in UTC — every date bucket must use the IST helpers in `src/lib/tz.ts`.
- Definitions the team has already agreed live in `docs/crm-metric-definitions.md` and
  `docs/crm-metrics-master.md`. Where code disagrees with them, that is a bug.

## Why earlier testing missed real bugs (do not repeat these mistakes)
1. Checking **totals only**. The team looks per counselor, per panelist, per day. Two bugs
   ("unique leads called" per counselor, "R1s per counselor") only showed per person.
2. Explaining away a mismatch as "a different definition". If the **same label shows two values
   for the same person and period anywhere in the app, it is a bug** — fix the number or fix the label.
3. Checking that numbers are right but not whether the page **answers the question the team asks**.
4. Testing as admin only. Admin bypasses row-level security; most real bugs were a counselor /
   panelist / program user being silently blocked by RLS (`supabase/migrations/*rls*` + policies).
5. Trusting "saved" — many writes returned no error but changed 0 rows (RLS USING filter).

## Method — do all five passes

### Pass 1 · Ground truth per entity
For the date ranges **today**, **yesterday**, **last 7 days**, and **1st of this month → today** (IST),
compute from raw tables (`leads`, `stage_history`, `call_logs`, `interview_bookings`, `lead_attribution`,
`visitor_sessions`, `ad_spend_daily`, `fee_records`, `installments`, `loans`):
- Per counselor: calls, unique leads called, connected calls, pickup %, leads created+assigned,
  first-time stage entries (nurturing, DNP, R1/R2/R3 booked, offer, closed paid, hive/student reject),
  R1 booked **by who booked it** (stage_history.changed_by) and by current owner, open stock.
- Per panelist: interviews scheduled, outcomes submitted, by round.
- Per day: leads, sessions (paid/organic), spend, R1/R2/R3 booked vs interviews held.
- Per course / cohort: leads, R1, converts, revenue booked (ex-GST) / realised.
Write these to a scratch file — every later pass compares against it.

### Pass 2 · Same number everywhere
Read the server code behind every page (not the UI text) and list **every place each metric is
shown**: card, table, chart, export, counselor dashboard, board column header, filter result.
For each (metric × entity × period) build a table: page / component / code function / value.
Flag any row where two places disagree, or where the same label means different things
(e.g. "R1" = stage entered vs interview on calendar vs first reached). Pages to cover:
- Admissions: `/admin/analytics`, `/admin/monthly` (all tabs), `/admin/history`, `/admin/leads`
  (board breakdown + grouped + list), `/attention`, `/admin/assign`
- Team: `/admin/counselor`, `/admin/panel`
- Finance: `/admin/payments`, `/program/fees`, `/program/past-students`, `/leads/[id]/fees`
- Marketing: `/marketing/dashboard`, `funnel`, `qualification`, `attribution`, `roi`, `ads`,
  `channels`, `performance`, `pnl/monthly`, `monthly`, `sessions`, `sessions/[id]`, `pages`,
  `heatmaps`, `website-leads`, `conversions`, `forecast`, `calendar`, `social`, `tasks`, `imports`
- Counselor home `/dashboard`, `/leads`, `/leads/[id]`, `/leads/[id]/book-interview`, `/leads/tasks`
- Panelist `/interviewer/interviews`, `/interviewer/availability`
- Settings `/admin/funnel`, `/admin/users`, `/admin/config`, `/admin/marketing/connections`
For each page also verify every **filter** (date range, month/year/cohort presets, course, cohort,
counselor, owner, stage group, organic/inorganic, funnel mode) actually changes **every** section on
the page — a section that ignores a filter is a bug (this happened with the rejection panel).

### Pass 3 · Questions the team asks
For each page write the 3–5 questions a manager / counselor / panelist / program person would ask
("How many R1s did Shreya book today?", "Which of my leads need a call now?", "Which interviews are
missing an outcome?", "How much fee is outstanding for Cohort 3?", "What did a Meta lead cost this
week?"). Check the page answers each **directly, correctly, and without scrolling a 25-column table**.
Report questions the CRM cannot answer.

### Pass 4 · Every action, every role
For every server action in `src/app/actions/*.ts` and every API route in `src/app/api/**`:
- Which roles can call it (`requireUser([...])`), which client it uses (`createClient` = RLS,
  `createAdminClient` = bypass), which tables it writes.
- Cross-check against the **latest** RLS policy for each table (latest `create/alter policy` in
  migrations). Flag any role that is allowed by `requireUser` but blocked by RLS.
- Flag every `.update()/.insert()/.upsert()` whose `{ error }` is ignored or that doesn't check
  rows affected (`.select("id")`), and every client call whose result isn't shown to the user
  (`reportResult` / an error state).
- Check "View as" (impersonation): rows written with `created_by / scored_by / counselor_id`
  must be the **actor** when RLS requires `= auth.uid()`.
- Use Debug mode: set breakpoints / logs in the action, run the flow locally against a **local or
  branch database only** (never production) with seeded test users for counselor, interviewer,
  program, marketing, admin, and record what actually happens.

### Pass 5 · Data health & time
- IST: any `new Date(x).toISOString().slice(0,10)`, `getHours()`, `setHours(0,0,0,0)` or
  `datetime-local` value parsed on the server without the IST helper is a bug.
- Stage history: one row per stage change (trigger `log_lead_stage_change`) — app code must not
  insert a second one.
- Attribution: a lead from a paid ad (session `utm_medium=paid`) must be inorganic on every page.
- Get-or-create lookups (`maybeSingle()` on a non-unique column) can multiply rows — check
  campaigns, channels, creatives, cohorts.
- Leads whose owner can't open them (course/cohort outside `counselor_scope`), leads in stages
  that are inactive or hidden on the board, course without cohort, duplicate phones.
- `npm run health` (scripts/health-check.mjs) must be clean; add any new check you discover there.

## Output — one file: `docs/deep-test-report.md`
1. **Bug table**, most severe first: id · page/flow · role · what the user sees · what is correct
   (with the ground-truth number) · root cause (file:line) · proposed fix · needs data fix? (Y/N).
2. **Inconsistency table** from Pass 2 (metric · entity · period · place A value · place B value).
3. **Unanswered questions** from Pass 3.
4. **Role × action matrix** from Pass 4 with ✅ / ❌ (blocked) / ⚠ (silent).
5. Anything that is a business decision rather than a bug — list separately, do not "fix".

Then fix the bugs one at a time, smallest safe change, matching surrounding code style. After each
fix: `npx tsc --noEmit -p .`, `npx eslint <changed files>`, and re-run the ground-truth comparison
for that metric. Run `npx next build` at the end. Do not commit or push — leave the changes for review.
