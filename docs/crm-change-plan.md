# HiveSchool CRM — Change plan (Phase 2)

_Based on `docs/crm-audit.md`. Nothing here is built yet. Items marked **❓** need an answer
before that item can be built._

Status key: **Exists** · **Partly** (exists but wrong or incomplete) · **Missing** · **Broken**

---

## A. Requests → plan

| # | Request | Current state | What needs to change | Data dependency | Risk | Open question |
|---|---|---|---|---|---|---|
| **1** | **Bugs: R3 Booked — 2 leads in pipeline don't show** | **Broken** | Find the 2 leads, confirm the cause (Period mode excludes R3 activity outside the range; R3 reject set is empty). Fix the R3 counting so "in pipeline now" and "booked in period" are both shown. | `stage_history`, `interview_bookings` | Low | ❓ Which page showed the gap (Admission Analytics? Counselor?) and which date range? |
| **2** | **Bugs: counselor dashboard needs repair** | **Broken** | Use one time window for every number (no all-time stages mixed in); credit leads by who owned them when the event happened where possible; date filter on the lead query. | `call_logs.counselor_id`, `stage_history.changed_by`, `leads.lead_allocated_to` | Medium — numbers will change | ❓ What exactly looks wrong to the team? (helps confirm the fix) |
| **3** | **Meta: "Leads generated not showing"** | **Broken** | Sync fix: store daily rows in a daily table (or sum days into the week instead of overwriting). Re-sync history from Meta. | Meta API access token (exists) | Low — re-sync rebuilds the table from Meta; nothing manual is lost (CSV-uploaded rows kept) | — |
| **4** | **Meta: show ad names** | **Broken** (sync requests campaign level only) | Sync at `level=ad` (campaign → ad set → ad); add a campaign / ad-set / ad drill-down. | Meta API; account has ad-level data | Low | — |
| **5** | **Meta: hook rates** | **Broken** (field never synced) | Request `video_play_actions` (3-second plays) and save to `video_plays_3s`. Hook rate = 3-sec plays ÷ impressions. Show "—" for non-video ads. | Meta API | Low | ❓ Confirm formula: 3-sec plays ÷ impressions (standard) — or ÷ reach? |
| **6** | **Leads — R1 Done back-tracked to lead creation date (cohort)** | **Partly** (R1 counted by the day it happened) | Add a **cohort toggle** on the Leads dashboard: "By event date" (today's view) / "By lead created date" (each R1 counted against the day the lead was created). In cohort view each lead counts **once**. Also fixes the R1 double-count. | `stage_history` (complete) | Low | ❓ Should cohort view apply to R1 Booked as well, or R1 Done only? (Recommend: both, plus R2/R3/Offer/Convert) |
| **7** | **Leads Cost — 4th table: Cost per R2, R3, Offer, Convert (Blended/Org/InOrg)** | **Missing** | Add the table using the same counting as #6 and the same spend split as today's Cost table. | `stage_history`, spend tables | Low | ❓ Blended/Org/InOrg definition — see **D1** |
| **8** | **Leads dashboard — Sessions split Paid / Organic** | **Partly** (data exists, not shown) | Add Paid and Organic session columns using the same classifier as the Channels page. | `visitor_sessions` (from 2 Jul 2026) | Low | Before July: only the Google Sheet has it — import? (see **D5**) |
| **9** | **Marketing P&L (monthly, 23 metrics)** | **Partly** (single-month P&L exists; offers/converts/revenue dated by last edit — wrong) | New monthly P&L table, months as columns. Each metric from one shared calculation (same as #6/#7). Fix event dating: offer/convert by stage-entry date; revenue booked by `fee_set_at`; revenue realised by instalment `date_hit_bank`/`paid_at`. "—" when there is no data. | `stage_history`, `fee_records`, `installments`, spend tables, sessions; pre-Jul 2026 = Google Sheet | Medium — revenue numbers for past months will move | ❓ **D1, D2, D3, D4** below |
| **10** | **Lead scoring: Lead Quality = Intent + Comms + Profile** (Simar) | **Partly** (Intent + Profile 1–5 exist; no Comms; scored at R1 booking, not after every call) | **One scoring system:** add `comms_score` to `lead_stage_scores`; counselor score form on **every call log** while the lead is in pre-R1 nurturing / R1 Booked; panelist form at R1/R2/R3 gives Intent + Profile. Lead Quality shown on the lead card and lists. Stored per round, never overwritten. | New column (additive migration) | Medium — changes counselor workflow | ❓ **D6** — scale, weights, how panel scores combine |
| **11** | **Profile score per round missing** | **Partly** (stored per round, not shown) | Show Profile (and Intent, Comms) per round — Counselor / R1 / R2 / R3 / average — on the lead and in analytics. Part of #10. | `lead_stage_scores` (backfill: existing rows already have round + context ✔) | Low | — |
| **12** | **Counselor: R1 split per counselor** | **Partly** | Per counselor: R1 Booked, R1 Done, R1 No-show, R1 Reject. Part of #13. | as #2 | Low | — |
| **13** | **Counselor: of calls made → % Closed Lost, Rejected, R1 Booked, DNP; of R1 Booked → % R2, R3, Offer, Convert** | **Missing** | New counselor funnel table. Base = unique leads the counselor called in the period. | `call_logs`, `stage_history` | Low | ❓ **D7** — base for "% of calls made" |
| **14** | **Rejection analytics — % dashboard of Hive reject reasons** | **Partly** (counts only, dated by last edit) | Percent breakdown by reason, by stage (R1/R2/R3/admission), by month; reasons grouped (Custom → "Other" + text list). Date by rejection date from `stage_history`. Start saving reason **into stage history** going forward. | `leads.stage_reason` (current only); new: reason on `stage_history` row | Low | Past rejections only have the *latest* reason — fine? |
| **15** | **ARPJU** | — | Treated as **ARPU** (typo). | — | — | ❓ Please confirm |
| **16** | **Call Tracking metrics** | **Note only** | **No change.** Findings for the team call: R1 booked uses *current* stage (leads that moved on drop out); "Day 1" = calendar day; every dial counts as an attempt; no connected/not-connected split. | — | — | To be decided in the team call |

### Grouped work (overlapping requests)
- **One funnel-counting engine** (#6, #7, #9, #12, #13): count each lead once per stage it ever
  reached, by event date *or* cohort date. Every dashboard uses it → numbers match everywhere.
- **One scoring system** (#10, #11): `lead_stage_scores` + Comms; Lead Quality computed in one place.
- **Meta sync rebuild** (#3, #4, #5): one change to the sync, one re-sync.
- **Event dating fix** (#9, #14, plus the existing All-months and Monthly tables): stop using `updated_at`.

---

## B. Marketing P&L — formula for each line

All costs use the spend split in **D1**. "Booked" vs "Completed" per **D2**.

| Line | Formula |
|---|---|
| Sessions | website sessions in month (paid + organic) |
| Leads | leads created in month |
| Cost / R1 Booked · R1 Completed · R2 Booked · R2 Completed · R3 Booked · R3 Completed · Offer | Total spend ÷ count |
| CPA | Total spend ÷ converts (`closed_paid`) |
| Organic / Inorganic / Total spend | see D1 |
| Revenue Booked | Σ fee agreed for students converted in the month (D3) |
| Revenue Realised | Σ money hit bank in the month (D3) |
| Rev Booked : Total Spend % | Revenue Booked ÷ Total Spend × 100 |
| Rev Realised : Total Spend % | Revenue Realised ÷ Total Spend × 100 |
| ARPU | Revenue Booked ÷ converts (❓ or realised — D4) |
| ARPU : CPA % | ARPU ÷ CPA × 100 |
| ARPU Booked | Revenue Booked ÷ converts |
| ARPU Realised | Revenue Realised ÷ converts |
| ARPU Booked : CPA % / ARPU Realised : CPA % | ÷ CPA × 100 |

Any line with a zero denominator → "—".

---

## C. Build order

1. **Bugs** — R3 booked (#1), counselor dashboard (#2), Meta sync rebuild + re-sync (#3–#5),
   R3 rejects, event dating for revenue/rejections.
2. **Schema** (additive only, nothing dropped or rewritten)
   - `lead_stage_scores.comms_score` + per-call scoring (#10, #11)
   - reason/kind columns on `stage_history` (#14)
   - lead allocation history table (so counselor credit survives reassignment) — *optional,
     only new data, can't be backfilled*
   - Meta daily ad-insights table
3. **Shared funnel engine** (cohort + event modes).
4. **New metrics/dashboards** — Leads cohort toggle + sessions split (#6, #8), Cost 4th table
   (#7), Counselor funnel (#12, #13), Rejection % (#14), Marketing P&L (#9), scoring UI.
5. **Historical import** of the Google Sheet into a monthly manual-figures table (if D5 = yes).

Each step = separate commits, tested against live data with sample numbers shown before deploy.

**Backfill limits** (cannot be recovered): Comms scores before launch; per-call scores
before launch; reason history for old rejections (only latest reason); who owned a lead in
the past; website sessions before 2 Jul 2026 (sheet only).

---

## D. Open questions

| | Question | My suggestion |
|---|---|---|
| **D1** | **Blended / Org / InOrg cost.** What counts as **organic spend**? Today: anything manually marked organic in cost entries (or the daily override); inorganic = Meta + other paid. The Google Sheet instead splits **Meta vs non-Meta**. And for Org/InOrg cost-per-X, is it organic spend ÷ organic leads' R2s (and inorganic ÷ paid), with Blended = total ÷ all? | Keep organic/inorganic; Org cost = organic spend ÷ organic-source counts, InOrg = paid spend ÷ paid-source counts, Blended = total ÷ all |
| **D2** | **"Booked" vs "Completed"** — counted on the **date the stage was entered** (when the counselor booked it), or on the **meeting date** (when the interview was scheduled/held)? | Booked = stage-entry date; Completed = interview date |
| **D3** | Revenue Booked — by fee-set date or convert date? Revenue Realised — by date hit bank? Include GST or net? | Booked = convert month, net of GST? (❓ GST) ; Realised = date hit bank |
| **D4** | **ARPU** = Booked ÷ converts or Realised ÷ converts? (The list has ARPU *and* ARPU Booked/Realised.) | ARPU = Booked ÷ converts (same as ARPU Booked) — or drop the duplicate |
| **D5** | Import the Google Sheet (Jan 2025 – Jul 2026) so P&L/Leads show history? Only the first tab could be read — are there other tabs that matter? | Yes, as a separate "historical figures" table, labelled |
| **D6** | **Scoring details:** scale (1–5 each → Lead Quality out of 15?); equal weights? Does "after every call" mean a required form on every call log, or optional? How do panel scores combine — average of counselor + panelist Intent/Profile per round, Comms from counselor only? Should Lead Quality replace the existing auto lead score (0–100) or sit beside it? | 1–5 each, equal weights, out of 15; required on connected calls; final = average of all rounds; keep the auto score but rename it "Auto score" |
| **D7** | Counselor "% of total calls made" — base = **unique leads called**, or **number of calls**? Which outcome when a lead has several (e.g., DNP then R1 Booked)? | Base = unique leads called in period; outcome = furthest stage reached |
| **D8** | Counselor credit — the counselor who **made the call / booked the R1**, or the **current owner**? | The one who did the action (from calls/stage history) |
| **D9** | Confirm **ARPJU = ARPU**. | Yes |
| **D10** | R1 Booked / R3 bug — which 2 leads and which page? | — |

---

## E. Decisions (answered 2 Oct 2026)

| | Decision |
|---|---|
| D1 | Organic / inorganic split as today. Org cost = organic spend ÷ organic-source counts; InOrg = paid spend ÷ paid-source counts; Blended = total ÷ all. |
| D2 | Booked = date the stage was entered; Completed = interview (meeting) date. |
| D3 | Revenue Booked by **convert month**. Fee is entered manually — show **excl. GST** as the main number and **GST separately**. Realised = date money hit bank. |
| D4 | ARPU = **Realised** revenue ÷ converts. |
| D5 | Import the Google Sheet as an **archive** that is shown the same way as live data when selected. |
| D6 | Intent, Comms, Profile each 1–5 → Lead Quality out of 15, each part shown. **Required after every call.** Counselor and panelist scores are **not combined** — both shown side by side. Lead Quality **replaces** the 0–100 auto score in the UI. |
| D7 | Base = **total dials**; each lead counted at the **furthest stage reached**. |
| D8 | Counselor credit = **current owner**. |
| D9 | ARPJU = ARPU. |
| D10 | Exact leads unknown — find why 2 R3 Booked leads are invisible and fix. |
| — | Old rejections keep only their latest reason — fine for now. |

---

## F. Phase 3 — built (branch `feat/crm-metrics-phase3`)

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | R3 Booked invisible | **Fixed** | Board loaded only the newest 250 cards while headers counted every lead; older R2/R3/offer leads now load per column. R3 rejects were also never counted in Admission Analytics. |
| 2 | Counselor dashboard | **Fixed** | One time window; shared funnel definitions; credit = current owner (leads of counselors with no cohort scope were dropped); avg calls/lead = calls ÷ leads called. |
| 3–5 | Meta: leads, ad names, hook rate | **Fixed** | New `meta_ad_insights_daily` (ad × day). Re-sync history after the migration: `/api/cron/ad-spend-sync?days=400` (cron auth) or Sync now (14 days). |
| 6 | R1 Done cohort view | **Built** | Toggle on Leads funnel: date it happened / lead created date. |
| 7 | Cost per R2 / R3 / Offer / Convert | **Built** | 4th table, Blended / Org / InOrg. |
| 8 | Sessions Paid / Organic | **Built** | `rpc_sessions_paid_split_ist`; shows "—" until migration runs. Data from 2 Jul 2026. |
| 9 | Marketing P&L | **Built** | `/marketing/pnl/monthly`; sheet archive for months before Jul 2026. Old single-month P&L redirects here. |
| 10–11 | Lead scoring | **Built** | Intent + Comms + Profile after every conversation call (pre-R1 / R1 Booked); panel scores side by side; per-round panel profile/intent on the lead page. |
| 12–13 | Counselor analytics | **Built** | Calls → outcome table (% of dials, furthest stage), R1 split, % of R1 Booked to R2/R3/offer/convert. |
| 14 | Rejection % | **Built** | Reason × stage %, dated by rejection; reasons now saved on stage history going forward. |
| 16 | Call Tracking | **Not touched** | Findings in the audit §5. |

**Migrations (run in order, before deploying):**
`20261002100000_meta_ad_insights_daily` · `20261002110000_sessions_paid_split` ·
`20261002120000_lead_quality_scoring` · `20261002130000_stage_history_reasons` ·
`20261002140000_marketing_monthly_archive`

**Could not backfill:** Comms scores before launch (Lead Quality fills in from the next call);
reasons on old stage-history rows (old rejections keep the lead's latest reason); Meta ad-level
history older than what Meta returns on re-sync (37 months); sessions before 2 Jul 2026
(sheet "active users" only); revenue for sheet months (not in the sheet).

**Judgment calls to confirm:**
- Score is required only when the call outcome is a conversation (connected, callback requested,
  other); no-answer / DNP calls can't be judged, so the score is optional there.
- Past-student entries (`source = past_student`, back-dated) are excluded from marketing funnel,
  P&L revenue and converts.
- Sheet months: sessions = "active users"; all sheet spend (Meta + non-Meta) is paid → inorganic, organic spend ₹0;
  sheet R1/R2/R3 treated as "booked" (completed unknown).
- Loans count as realised on their last-updated date (no hit-bank date is stored for loans).
