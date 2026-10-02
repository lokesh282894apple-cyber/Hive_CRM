# HiveSchool CRM — Current-state audit (Phase 1)

_Read-only audit of `main` @ `f6171d0`, 2 Oct 2026. No code was changed. Numbers in this
document come from the code and from parity checks already run on live data; anything that
could not be verified without database access is marked **(unverified)**._

---

## 1. Stack, structure, data flow

| Layer | What |
|---|---|
| App | Next.js 14.2 (App Router, React Server Components + server actions), TypeScript, Tailwind |
| Hosting | Vercel (`lokesh-f2cd/hive-crm`, region `bom1` Mumbai), auto-deploy from `main` |
| Database | Supabase Postgres (`myxdfsramkqxkiuzqbxk`, ap-south-1, Nano/free tier). **No ORM** — `@supabase/supabase-js` query builder + Postgres functions (RPC) |
| Auth | Supabase Auth; roles in `users.role`: `admin`, `counselor`, `interviewer`, `marketing`, `program`. RLS on every table; dashboards mostly read with the service role after `requireUser()` |
| Business calendar | India time (IST) everywhere via `src/lib/tz.ts` (since 30 Sep) |

```
src/app/(app)/…        pages (server components) — one folder per route
src/app/actions/…      server actions (all writes)
src/app/api/…          webhooks (website forms, Meta, Twilio, Read.ai), crons, admin checks
src/lib/analytics/…    admissions metrics (funnel, counselor, panel, payments, revenue, rejection)
src/lib/marketing/…    marketing metrics (funnel, channels, P&L, ads, sessions, attribution)
src/components/…       client components (boards, tables, forms, charts)
supabase/migrations/   52 SQL migrations (schema + RPCs + indexes)
```

**How dashboards get data**
1. A server component calls a loader in `src/lib/analytics/*` or `src/lib/marketing/*`.
2. Loaders either
   - call a **Postgres function** that returns aggregates as one JSON value
     (`rpc_counselor_home_v2`, `marketing_overview`, `marketing_top_pages`,
     `rpc_sessions_per_day_ist`, `rpc_sessions_by_source_v2`, `get_lead_card_metrics`), or
   - **page raw rows** (`fetchAllPages`, up to 20 000 rows/request) and aggregate **in
     JavaScript** (most admissions and marketing funnels).
3. Results are cached with `unstable_cache` (60–300 s, stale-while-revalidate). Marketing
   overview/top-pages are additionally **precomputed by `pg_cron`** into
   `marketing_rpc_cache` every 10–30 min.
4. Nothing important is calculated in the browser except card-level call-metric filters on
   the leads board.

---

## 2. Lead pipeline — exact stage values

Source: `STAGES` / `STAGE_LABELS` in `src/lib/constants.ts`. The DB no longer has a
`leads.stage` CHECK constraint (dropped in `20260921160000_funnel_manager.sql`); stages are
validated in the app against the editable **`funnel_stages`** table (Funnel Manager). ⚠️ Admins
can therefore add custom stage slugs that none of the analytics code knows about.

| Group | slug → label |
|---|---|
| Pre-interview | `lead_created` Lead Created · `in_funnel` In-Funnel · `new_lead` New Lead · `call_logged_nurturing` Call Logged – Nurturing · `dnp` DNP · `no_show` No Show · `reschedule` Reschedule · `retarget_next_batch` Retarget Next Batch · `admission_team_rejected` Admission Team Rejected |
| R1 | `r1_booked` R1 Booked · `r1_confirmed` R1 Confirmed · `r1_reject` R1 Reject · `r1_no_show` R1 No Show · `r1_reschedule` R1 Reschedule · `r1_student_reject` R1 Student Reject |
| R2 | `r2_booked` R2 Booked · `r2_tbb` R2 TBB · `r2_reject` · `r2_no_show` · `r2_reschedule` · `r2_student_reject` |
| R3 | `r3_booked` R3 Booked · `r3_tbb` R3 TBB · `r3_reject` · `r3_no_show` · `r3_reschedule` · `r3_student_reject` |
| Offer | `yet_to_offer` Yet to Offer · `offered` Offered · `offered_accepted` Offered – Accepted · `student_reject` Offer Student Reject |
| Closed | `closed_paid` Closed – Paid · `closed_deferred` Closed – Deferred · `closed_refund` Closed – Refund · `closed_lost` Closed – Lost |

Derived definitions in code (not stages):

| Term the team uses | How the code defines it |
|---|---|
| **R1 Nurturing** | no such stage — closest is `call_logged_nurturing` (pre-R1) |
| **R1 Done / Conducted** | marketing funnel: entering any of `r1_confirmed, r2_booked, r2_tbb, r3_booked, yet_to_offer, offered, closed_paid` (`R1_DONE_STAGES`); admissions funnel: `R1_CONDUCTED` set + interview outcome |
| **Convert / Won** | `closed_paid` (`WON_STAGES`); counselor dashboard also counts `offered_accepted` |
| **Closed Lost** | `LOST_STAGES` = `closed_deferred, closed_refund, closed_lost` (unified 30 Sep) |
| **Hive reject** | `admission_team_rejected, r1_reject, r2_reject, r3_reject` (+ `leads.reject_kind = 'hive'`) |
| **Student reject** | `r*_student_reject, student_reject` (+ `reject_kind = 'student'`) |
| **Open** | every stage except the four closed ones (rejections count as open — kept by decision) |

---

## 3. Dashboards and their metrics

### 3.1 Marketing → Lead funnel (`/marketing/funnel`) — the team's "Leads dashboard"
Loader `fetchLeadFunnelUncached` (`src/lib/marketing/dashboard-queries.ts`). Daily rows,
rolled up weekly/monthly on the page. Three tables:

| Table | Metric | Formula |
|---|---|---|
| Inputs | Sessions | `visitor_sessions` count per IST day of `first_seen_at` (RPC `rpc_sessions_per_day_ist`) |
| | Leads | leads with `created_at` on that IST day |
| | Organic spend | daily note `organic_spend_inr` if set, else Σ `marketing_cost_entries.amount_inr` where `is_organic` |
| | Inorganic spend | daily note `inorganic_spend_inr` if set, else Σ `ad_spend_daily.spend` (Meta) + non-organic cost entries |
| | Total spend | organic + inorganic |
| Outputs | Org / Inorg leads | `isInorganicLead()` — paid if campaign `source_type='paid_ad'`, paid `utm_medium`, or source matches meta/facebook/google/linkedin-paid |
| | **R1 booked** | stage-history entries into `r1_booked`/`r1_confirmed` **on that day** (one per lead per day) |
| | **R1 done** | stage-history entries into `R1_DONE_STAGES` **on that day** (one per lead per day) |
| | S→L % | leads ÷ sessions · R1÷L % = R1 booked ÷ leads (org/inorg variants) |
| Cost | CPL blended/org/inorg | spend ÷ leads (matching split) |
| | Cost / R1 blended/org/inorg | spend ÷ R1 booked (matching split) |
| (also) | AQL total/org/inorg | `aql_at` date, else created date if intent good/maybe and financial check pass |

### 3.2 Marketing → Channels / P&L (`/marketing/channels`, `/marketing/pnl`)
- **Channel funnel** (`fetchChannelFunnelUncached`): per channel — sessions (RPC
  `rpc_sessions_by_source_v2` → `classifyMarketingChannel`), forms, leads, R1, R2, R3, offer,
  converts, convert %, CPL, cost/R1, cost/offer, CAC.
- **Month P&L** (`fetchMonthPnlUncached`), one month at a time: sessions, leads, R1 booked,
  R1 completed, offers, converts, organic / inorganic / total spend, revenue booked, revenue
  realized, CPL, cost/R1, CAC, ROMS (revenue realized ÷ spend). Sections: total / organic /
  inorganic / Meta forms.
  - offers = leads **currently** `offered` whose `updated_at` is in the month
  - converts = leads **currently** `closed_paid` whose `updated_at` is in the month
  - revenue booked = Σ `fee_records.total_fee`, realized = Σ `revenue_amount` or
    `total_fee − remaining_fee`, for fee records **`updated_at` in the month**
- **Monthly table** (`fetchMonthlyMarketingDataUncached`, 18/24 months): leads, spend,
  revenue per month (fee_records by `updated_at` month).

### 3.3 Marketing → Ads / Performance (`/marketing/ads`) — "Meta dashboard"
`fetchAdInsights` reads **`ad_insights_weekly`**: week, campaign, ad, spend, results,
cost/result, CTR, CPC, hook rate (`video_plays_3s ÷ impressions`), "needs review" flag.
Filled by the Meta sync (`src/lib/marketing/meta-sync.ts`, nightly cron + "Sync now") and CSV
upload.

### 3.4 Marketing → Dashboard / Performance / Pages / Heatmaps / Campaigns
`marketing_overview` / `marketing_top_pages` RPCs (precomputed): sessions, page events,
attributed conversions, conversion rate, avg events/session, daily sessions vs conversions,
by channel / campaign / UTM / device, recent sessions & conversions, top pages (pageviews,
clicks, scroll depth).

### 3.5 Marketing → Calls (`/marketing/calls`) — "Call Tracking" (not to be changed)
`fetchDailyCallTracker`, per lead-creation IST day: new leads, day-1/2/3 attempts (calls on
the creation day / +1 / +2), leads called day 1, leads with any call, R1 booked, day-1
coverage % = called day 1 ÷ new leads, R1 % = R1 booked ÷ new leads. See §5 for findings.

### 3.6 Marketing → Attribution / ROI / Qualification / Website leads / Conversions / Sessions
Lists and rollups over `leads`, `lead_attribution`, `campaigns`, `ad_spend_daily`,
`visitor_sessions` (attribution report first/last touch, campaign ROI, AQL qualification with
DQ-reason counts, website-session journeys, conversions, session list).

### 3.7 Admin → Admission Analytics (`/admin/analytics`)
`fetchAdmissionsFunnel` (`src/lib/analytics/admissions-funnel.ts`) over a shared lead base
(leads created/updated since the chart window + their stage history, bookings, attribution).
"Facts" per lead: stages ever, stages in period, stages by IST day, bookings.
- **Period** mode counts stage activity *inside* the date range; **Snapshot** counts
  everything the lead has ever reached.
- Round funnels R1/R2/R3: on calendar, no-show, reschedule, conducted, conducted → next
  round, conducted → reject, conducted → yet to move.
- Offer funnel: total offered, closed won, closed lost.
- Totals: leads created in range (organic/inorganic), month strip, year charts, conversion
  table, attribution split, day-wise R1/R2/R3 grid.
- Rejection panel (`fetchRejectionFunnel`): hive vs student totals by stage, hive reasons,
  student reasons, no-show reasons, offer accepted/rejected/pending, avg profile & intent.

### 3.8 Admin → All months, Counselor, Panel, Payments, Revenue; Program → Fee & Loan
- **All months** (`fetchAdmissionsMonthlyRollup`): per IST month — leads, open leads, R1
  booked, converts, lost, revenue booked/realized.
- **Counselor** (`fetchCounselorDashboard`): per counselor — calling (allocated, calls,
  avg/lead, avg/day, pickup %, talk time, inbound/outbound, unique leads called) and
  pipeline (nurturing, R1 booked, R1 conducted, R1 reject, R2, R3, offer, student reject,
  hive reject, converted after offer, not converted %), avg profile/intent given.
- **Panel** (`fetchPanelPerformance`): per interviewer — interviews, outcomes, scores.
- **Payments** (`fetchPaymentsDashboard`): Offered/Closed-paid students only — booked,
  collected, outstanding, instalments, loans. **Fee & Loan tracker**: deal stage board, loan
  board, booked vs realised revenue per month.
- **Counselor home** (`/dashboard`): KPIs, interviews today, attention list, daily activity,
  funnel groups, sources, stage breakdown (RPC `rpc_counselor_home_v2` behind
  `ADMISSIONS_RPC=1`).

---

## 4. What data we store

| Topic | Where | Notes |
|---|---|---|
| **Lead creation vs stage-change dates** | `leads.created_at`; **`stage_history`** (`lead_id, from_stage, to_stage, changed_at, changed_by`) written by trigger on every insert/stage change | Full stage history exists ✔. `changed_by` = `auth.uid()`, so it is NULL when a change is made with the service role (webhooks, imports, crons). No per-stage timestamp columns on `leads`. |
| **Source / UTM / organic vs paid** | `leads.source, utm_source/medium/campaign/content, meta_campaign_name/ad_set/ad_name`; `lead_attribution` (first/last-touch campaign, session); `campaigns.source_type` (`paid_ad / influencer / organic`) | Organic vs paid is **derived** by `isInorganicLead()` — not stored. |
| **Sessions** | **Our own tracking**: website script → `/api/track/event` → `visitor_sessions` (+`page_events`). Not GA, not Meta | ~46 k sessions since **2 Jul 2026**. Each has `utm_*`, `matched_campaign_id` → can be split paid/organic. History before July exists only in the Google Sheet ("Active users"). |
| **Ad spend** | `ad_spend_daily` (Meta API, per campaign per day); `marketing_cost_entries` (manual, `is_organic` flag, category); `marketing_daily_notes.organic_spend_inr / inorganic_spend_inr` (manual per-day override) | Organic vs inorganic spend = manual flag + overrides; Meta = inorganic. |
| **Meta ad-level data** | `ad_insights_weekly` (ad name, spend, results, impressions, clicks, video plays, …) | Sync is broken for ad level — see §5. |
| **Revenue** | `fee_records` (`total_fee`, `gross_fee_with_gst`, `net_fee_without_gst`, `remaining_fee`, `revenue_amount`, `fee_set_at`); `installments` (`amount_to_realise`, `amount_realised`, `amount_hit_bank`, `paid_at`, `date_hit_bank`); `loans` | Booked = fee agreed; realised = money received. Dates for both exist (`fee_set_at`, `paid_at`/`date_hit_bank`) but reports use `updated_at` — see §5. |
| **Intent / scoring** | `lead_stage_scores` (append-only: `profile_score` 1–5, `intent_score` 1–5, `context` `admission_r1 / panel_r1 / panel_r2 / panel_r3 / manual_intent`, `scored_by`); `leads.avg_student_intent` (mean of all intent scores); `leads.intent_score` 0–100 = **auto lead score** (model, with counselor override, `score_auto`, `score_override_*`); `leads.convert_probability`; `lead_panelist_grades` (tier A/B/C + score per panelist); `leads.qualification_intent` + `financial_check` (marketing AQL) | Counselor scores at **R1 booking** (required), panelist at **R1/R2/R3 submission**, manual intent from offer fields. No **Comms** score. No average **profile** score on the lead. Not captured "after every call". Two unrelated things are both called "intent". |
| **Rejection reasons** | `leads.stage_reason` (text), `reject_kind` (`hive / student`), `reject_at_stage`, `reject_reason_category`, `dq_reason`; fixed lists `ADMISSION_REJECTION_REASONS` (6 + "Custom"), `STUDENT_REJECTION_REASONS` | Stored only on the **current** lead row (not in history); "Custom" allows free text. |
| **Counselor attribution** | `call_logs.counselor_id` per call ✔; `leads.lead_allocated_to` = **current** owner only; `stage_history.changed_by` | **No allocation history** — reassigning a lead moves all its past activity to the new owner in reports. |

---

## 5. Broken, half-built or inconsistent

### Bugs (wrong numbers today)
1. **Meta sync overwrites weekly rows with daily values.** It fetches `time_increment=1`
   (daily) but upserts into `ad_insights_weekly` on `(week_start, campaign, ad set, ad)`, so
   each day replaces the previous day → a week shows only its last synced day's spend and
   results. Likely cause of **"Leads generated is not showing"**.
2. **Meta dashboard can't show ad names.** Both the cron and "Sync now" call the sync with
   `level: "campaign"` → every row's ad name is `"(campaign total)"`.
3. **Hook rate is always empty.** It is computed from `video_plays_3s`, which the sync never
   requests or writes (only ThruPlays).
4. **P&L offers, converts and revenue are dated by `updated_at`** (last edit), not by when the
   offer/convert/payment happened → editing a lead later moves its conversion and revenue to
   another month. The All-months and Monthly tables have the same issue for revenue.
5. **Rejection panel is dated by `leads.updated_at`** → same month-drift problem.
6. **R3 rejects never counted** in Admission Analytics round funnel (the R3 reject set is
   empty).
7. **R1 Done/R1 booked double-count across days** in the marketing funnel (dedupe is per
   lead per day, so R1 confirmed Monday + R2 booked Thursday = 2 "R1 done").
8. **Counselor dashboard mixes time windows**: nurturing and hive-reject add leads by
   *current* stage regardless of the date range, on top of in-range history; all pipeline
   credit goes to the **current** owner. Plausible cause of "needs repair" (unverified which
   symptom the team sees).
9. **"R3 Booked — two in pipeline but don't show"** (unverified): in Period mode the funnel
   only counts R3 activity inside the range; leads that entered R3 earlier with interviews
   outside the range are excluded even though they sit in the pipeline. Needs the two lead
   ids to confirm.

### Inconsistencies / risks
- Funnel Manager allows custom stage slugs; analytics hard-code built-in slugs → custom
  stages are invisible to every metric.
- "Intent" means two different things (`leads.intent_score` 0–100 auto score vs 1–5 human
  intent in `lead_stage_scores`).
- Counselor "converted" includes `offered_accepted`; everywhere else Won = `closed_paid`.
- `stage_history.changed_by` is NULL for service-role writes (webhooks, imports).
- Spend: the sheet splits **Meta vs non-Meta**; the CRM splits **organic vs inorganic**, and
  maps manual non-Meta costs to *organic* unless flagged otherwise.
- Paid vs organic sessions exist in the data but aren't shown on the Leads dashboard.

### Call Tracking (noted only — not to be changed)
- "R1 booked" = leads whose **current** stage is `r1_booked`/`r1_confirmed`; leads that moved
  on to R2/offer/paid drop out, so R1 % falls the further back you look.
- "Day 1" = same calendar day as creation; a lead created at 11:50 PM has 10 minutes of
  "day 1".
- Calls are not de-duplicated per lead per day (5 dials = 5 attempts) — may or may not be
  intended.
- No connected vs not-connected split (data exists: `call_logs.outcome/duration`).

### Historical data (Google Sheet)
- First tab exported fine (monthly, **Jan 2025 → 13 Jul 2026**): Meta spend, non-Meta spend,
  activations (notes), active users total/paid/organic, LP conversion %, leads
  total/paid/organic, AQLs paid/organic, R1s, R2s, R3s, offered, converts total/paid/organic.
  R1–converts are mostly blank. Some numeric cells hold text (e.g. "Event Cost -1.5Lakhs").
- The CRM's own data starts ~**Jul 2026**, so a P&L for earlier months needs this sheet
  imported (as monthly manual figures).
