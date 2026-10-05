# HiveSchool CRM — every page, every metric: what it does today, what it should be

_Full read of the code on 5 Oct 2026 (main @ b4e77a1). Nothing changed yet._
Legend: ✅ correct for its label · ⚠️ inconsistent with other pages / confusing · ❌ bug · ❓ needs a team decision

---

## Part A — Inventory (53 pages)

**Pages that show metrics (audited in Part B)**
| Area | Page | Data source |
|---|---|---|
| Admissions | Admission Analytics | `admissions-funnel.ts` + `rejection-funnel.ts` |
| | All months (admissions) | `admissions.ts › fetchAdmissionsMonthlyRollup` (+ counselor / panel views) |
| | Counselor | `counselor-performance.ts` |
| | Panel | `panel-performance.ts` |
| | Counselor home (/dashboard) | `rpc_counselor_home_v2` |
| | Leads board / list (column totals, card metrics) | `leads-query.ts`, `get_lead_card_metrics` |
| | Lead page (Lead Quality, calls, history) | `leads/[id]` |
| | Attention | `attention.ts` |
| Finance | Payments (Revenue redirects here) | `payments.ts` |
| | Fee & Loan tracker | `program/fee-tracker.ts` |
| Marketing | Dashboard, Performance, Pages, Heatmaps | `marketing_overview` / `marketing_top_pages` RPCs |
| | Leads › Funnel | `fetchLeadFunnel` + funnel engine |
| | Leads › Qualification | `fetchQualificationLeads` |
| | Leads › Calls (not to be changed) | `fetchDailyCallTracker` |
| | Leads › Attribution | `fetchAttributionReport` |
| | Leads › ROI | `fetchCampaignRoi` |
| | Performance › Meta ads | `fetchMetaAdPerformance` |
| | Performance › Channels / Channel P&L | `fetchChannelFunnel` |
| | P&L › Marketing P&L | `pnl-monthly.ts` |
| | P&L › All months (marketing) | `fetchMonthlyMarketingData` |
| | Planning › Forecast | `marketing_forecasts` (typed in) |
| | Socials, Calendar | publish rate |
| | Website › Sessions, Lead time, Conversions | session lists |

**Operational pages (forms / lists, no calculated metrics):** Bulk Assign, Funnel Manager,
Users & Roles, Config, Ad Connections, Add lead, Book interview, Lead fees, Tasks, Messages,
Interviewer availability / interviews, Imports, Campaigns setup, Past students, AI chat.
Admin dashboard / forecast → redirect to Analytics; Revenue → redirects to Payments.

---

## Part B — Audit: what each metric really calculates

### Root causes that break consistency across the CRM
1. **Five different date rules for "R1 / R2 / R3 / Offer / Convert"** ⚠️
   - stage entered in range (All months R1, Counselor),
   - interview scheduled in range (Panel, Analytics "on calendar"),
   - lead created in range + **current** stage (Channels, Attribution, ROI, Calls, All months converts),
   - lead touched recently + current stage (Counselor home),
   - first time reached, event or cohort (Leads funnel, P&L, Counselor pipeline — the shared engine).
2. **Two organic/paid rules** ⚠️ — Admissions uses campaign type + `source` text (paid-ad
   website leads = organic; influencer = paid). Marketing uses campaign + `utm_medium` + source
   (paid-ad website leads = paid; influencer = organic).
3. **Five revenue rules** ⚠️ — P&L/marketing months (excl. GST at convert month; cash by date
   hit bank) · Admissions months (total fee by last edit) · Payments (`revenue_amount` or total −
   remaining) · Fee & Loan month box (full gross fee counted as realised) · Attribution/ROI
   (total − remaining).
4. **Old CRM data before October is unreliable** (team) — still feeds Jul–Sep everywhere.
5. **Inputs missing** — spend not uploaded, panel outcomes not submitted, call length not filled
   → blanks / zeros that look like wrong logic.

### Admissions › Admission Analytics
| Metric | ✓ | Today |
|---|---|---|
| Total leads, organic/inorganic | ✅/⚠️ | created in range; admissions paid rule |
| R1/R2/R3 on calendar (Period) | ⚠️ | stage entered **or** interview scheduled in range |
| Conducted / no-show / reschedule | ⚠️ | outcome submitted or confirmed/reject stage; R1 skipped straight to R2 booked = not conducted |
| Moved to next round | ✅ | ever reached next round |
| Total offered | ❌ | includes **Yet to offer**, Deferred, Refund |
| Closed won / lost | ⚠️ | lost = deferred + refund + lost |
| Conversion % (R1→Offer, R1→Convert, Offer→Convert, Lead→Convert) | ❌ | numerator = offers *happening* in range (any lead); denominator = leads *created* in range |
| Month strip / year charts / day-wise grid | ✅ per its own (event) rule |
| Pipeline snapshot mode | ⚠️ | "ever" only looks back to the chart window start |
| Rejection panel (Hive/Student %, reasons × stage) | ✅ | dated by rejection; old rejections use latest reason |

### Admissions › All months
| Metric | ✓ | Today |
|---|---|---|
| Leads | ✅ | created in month |
| Available (open) | ✅ | of those, open **today** |
| R1 booked | ⚠️ | R1 stage entered in month (different basis from Leads on same row) |
| Converts | ⚠️ | created in month and **currently** Closed–Paid |
| Lost | ❌ | only Closed–Deferred (ignores Closed–Lost, Refund) |
| Revenue booked / realised | ❌ | fee record **last edit** month; booked = total fee |

### Admissions › Counselor
| Metric | ✓ | Today |
|---|---|---|
| Calls, unique leads called, avg/lead, avg/day, pickup %, in/out | ✅ | calls in range, by who logged |
| Talk time | ✅ formula, ❌ data | only 2 of 332 connected Sep calls have a length |
| Allocated · created in range / open stock | ✅ | |
| Pipeline (R1→convert) | ✅ | first time reached in range, current owner |
| Calls → outcome, R1 split, from R1 % | ✅ | % of dials, furthest stage |
| Avg profile / intent given | ⚠️ | includes "stage move" scores where profile was copied from intent |

### Admissions › Panel
| Metric | ✓ | Today |
|---|---|---|
| Booked | ❓ | interview **slots** in range, incl. future ones, all rounds; a lead can count twice |
| Conducted | ✅ | outcome submitted |
| Selected | ❓ | "Confirmed" only; **TBB moves the lead to the next round** but isn't counted as selected |
| No show / Pending | ❌ | an interview can't be marked no-show → stays Pending forever |
| Offered after / Won after | ⚠️ | only for Confirmed; leads with no offer history get a fake offer date |

### Admissions › Counselor home (/dashboard)
| Metric | ✓ | Today |
|---|---|---|
| Open / Won / Lost / Win rate | ⚠️ | **current** stage of leads created **or edited** in the last N+30 days |
| New leads | ❌ | includes Call Logged – Nurturing |
| Won per day | ❌ | dated by last edit |
| Interviews today / upcoming, calls | ✅ | |

### Admissions › Leads board & lead page
| Metric | ✓ | Today |
|---|---|---|
| Column totals | ✅ | exact counts per stage (all older leads now load) |
| Card: calls, days called, calls since stage, last call | ✅ | `get_lead_card_metrics` |
| Lead Quality (I + C + P /15), panel scores | ✅ | latest counselor call score; latest panel score |
| Attention list | ❓ | "provisional" rules: no contact N days, unresolved no-show, overdue instalment |

### Finance › Payments
| Metric | ✓ | Today |
|---|---|---|
| Students listed | ❌ | only stage **Offered** or **Closed–Paid** — "Offered – Accepted" students with fees are missing |
| Revenue per student | ⚠️ | `revenue_amount` else total − remaining |
| Instalment booked / collected / outstanding | ✅ | from instalment lines |
| Date filter | ⚠️ | lead created date |

### Finance › Fee & Loan tracker — "revenue this month" box
| Metric | ✓ | Today |
|---|---|---|
| Month | ❌ | lead's **last edit** month |
| Converts | ❌ | every fee student touched that month, any stage |
| Booked gross / net | ⚠️ | gross incl. GST / net |
| Realised | ❌ | **full gross fee** for anyone not dropped (assumes fully paid) |
| Loss / drop-offs | ⚠️ | depends on the above |

### Marketing › Dashboard / Performance / Pages / Heatmaps
| Metric | ✓ | Today |
|---|---|---|
| Sessions, page events, top pages, scroll | ✅ | own tracking, from 2 Jul 2026 |
| "Conversions" / conversion rate | ⚠️ | website form leads linked to a visit ÷ sessions — **not enrolments**; Meta-form leads not included |

### Marketing › Leads › Funnel ✅ (shared engine)
Sessions (paid/organic) · Leads (org/inorg) · AQL · R1/R2/R3 booked & completed · Offer · Convert ·
spend · CPL · cost per stage — all ✅ for their labels. Caveats: spend not uploaded; organic spend is
always ₹0 by the team's rule, so **all "Org" cost columns are ₹0** ❓.

### Marketing › Qualification
AQL = intent **Good or Maybe** and financial check **Pass** ❓ (does "Maybe" count?). DQ reasons %.

### Marketing › Calls (agreed: no changes)
R1 = **current** stage R1 booked/confirmed (drops leads that moved on); day 1 = calendar day.

### Marketing › Attribution, ROI
| Metric | ✓ | Today |
|---|---|---|
| Leads by UTM / campaign | ✅ | first / last touch |
| R1 | ❌ | **current** stage only |
| Enrolled | ⚠️ | created in range and currently Closed–Paid |
| Revenue / ROAS / ROI | ⚠️ | total − remaining (another revenue rule) |
| CAC (ROI) | ⚠️ | Meta spend ÷ enrolments, Meta campaigns only |

### Marketing › Meta ads ✅
Spend, impressions, CTR, CPC, hook rate (3-s plays ÷ impressions), hold rate, Meta leads, CRM leads
by ad tag. Needs a valid Meta token.

### Marketing › Channels / Channel P&L
| Metric | ✓ | Today |
|---|---|---|
| Sessions by channel | ✅ | |
| R1 / R2 / R3 / Offer / Converts | ❌ | **current** stage; R1 excludes anyone who moved on; Offer includes Yet to offer |
| Forms | ⚠️ | same as Leads |
| Spend by channel | ⚠️ | manual costs mapped by text of the channel name |

### Marketing › P&L › Marketing P&L ✅ formulas
All 23 lines per the agreed formulas. ⚠️ Jul–Sep use CRM data (team wants sheet archive up to Sep).

### Marketing › P&L › All months (marketing)
✅ funnel + revenue, but ❌ **CAC adds a hard-coded ₹60,000 "sales cost" every month**.

### Marketing › Forecast / Socials / Calendar
Forecast "actual" leads and spend are **typed in**, not calculated ⚠️. Publish rate = published ÷
(published + missed) ✅.

---

## Part C — What a founder should track (proposed definitions)

One rule set for the whole CRM, chosen for a new-age B-school running paid + organic admissions.

### C1. Global rules
| Rule | Proposal | Why |
|---|---|---|
| **Date basis** | Every admissions funnel number counts by **lead created date** (cohort). "By activity date" stays available as a switch for daily ops. | Answers the founder question "what happened to the leads we got in October?"; spend and leads line up in the same month. |
| **Unit** | Count **leads**, not slots or stage changes. Each lead once per stage, the first time it reached it. | 16 bookings ≠ 16 students. |
| **Reached = passed through** | A lead that is now in R3 counts as R1 and R2 too. | Funnels must never shrink because a lead moved on. |
| **Paid vs organic** | **Paid** = came from anything we paid for: paid campaign, `utm_medium` paid/cpc/ppc/paidsocial, Meta lead forms, influencer. **Organic** = everything else. Decided at lead creation, never changes. | One answer per lead on every page. |
| **Spend** | All money spent = inorganic (team rule). Organic = no spend. | As agreed. |
| **Revenue** | **Booked** = fee excl. GST, in the month the student converts. **Realised** = cash that hit the bank, in the month it hit. GST shown separately. Refunds subtract from realised. | Booked = sales performance; realised = cash. |
| **Lost** | Closed–Lost and Closed–Refund = lost; Deferred shown separately ("next batch"). | Deferred students may still pay. |
| **Cut-over** | CRM is the source from **1 Oct 2026**; everything before comes from the team's sheets (archive), shown the same way. | Old CRM data is not trusted. |
| **Missing data** | Show "—" with "no data entered", never 0. | Stops blanks looking like bugs. |

### C2. The funnel (all pages)
| Metric | Definition |
|---|---|
| Sessions (paid / organic) | website visits, split by the paid rule |
| Leads | leads created in the period |
| AQL | leads that passed qualification (intent + financial check) |
| R1 booked | leads that got an R1 on the calendar (first time) |
| R1 done (show-up) | leads whose R1 actually happened (panel outcome submitted) |
| R1 pass | R1 done with result = pass (Confirmed or TBB) |
| R2 / R3 booked, done, pass | same pattern |
| Offer | leads that received an offer (Offered / Accepted / Paid — not "Yet to offer") |
| Convert | leads that paid (Closed–Paid) |
| Stage conversion % | each step ÷ the step before, **same leads** (cohort) |
| Show-up rate | R1 done ÷ R1 booked |
| Time to stage | median days lead → R1 booked, → offer, → convert |

### C3. Cost & return
CPL · cost per AQL · cost per R1 done · cost per offer · CAC (spend ÷ converts) · ARPU (realised ÷
converts) · ROAS (realised ÷ spend) · payback = CAC ÷ ARPU. All by paid / organic / total, by month.

### C4. Team
| Who | Metrics |
|---|---|
| Counselor | leads owned · speed to first call (hours) · contact rate (connected ÷ leads called) · dials per day · talk time per day · R1 booked per 100 leads · show-up % of their R1s · offer % · convert % · avg Lead Quality given |
| Panelist | interviews done · outcome submitted within 24 h % · pass % · offer % and convert % after pass · avg intent / profile given · pending (overdue) outcomes |

### C5. Quality & leakage
Lead Quality distribution · rejection % by reason × stage (Hive vs student) · no-show % per round ·
deferrals · refunds · collection % (realised ÷ booked) · overdue instalments.

---

## Part D — Questions for the team (only where we need their call)

Tick one per question.

1. **Date basis for admissions numbers** — □ Lead created date (cohort) as default, activity date as a switch  □ Activity date default
2. **"TBB" outcome** — □ counts as a pass (moved to next round)  □ separate, not a pass
3. **No-shows** — □ panelist can mark an interview "No show" (so it leaves Pending)  □ only via stage
4. **AQL** — □ intent Good only  □ Good or Maybe   (financial check must pass in both)
5. **Influencer campaigns** — □ paid (inorganic)  □ organic
6. **Deferred students** — □ show separately ("next batch")  □ count as lost
7. **₹60,000 monthly "sales cost" in CAC** — □ remove  □ keep (confirm amount)
8. **Counselor home "Won / Lost / Win rate"** — □ for leads created in the selected period  □ current pipeline snapshot
9. **Attention rules** — confirm: no contact after __ days · unresolved no-show after __ days · overdue instalment
10. **Archive sheets** — share Jul, Aug, Sep (and the spends sheet); confirm CRM is live from 1 Oct

---

## Part E — Fix list once answers are in
1. Every page reads funnel numbers from the shared engine (Analytics, All months, Panel, Channels,
   Attribution, ROI, Counselor home) — fixes all ❌ "current stage" and "mixed basis" issues.
2. One paid/organic function and one revenue module, used everywhere (incl. Payments, Fee &
   Loan, Attribution, ROI).
3. Fix: Total offered, Lost, Payments missing Accepted students, Fee & Loan month box, ₹60k CAC,
   Counselor home New / Won, panel no-show.
4. Cut-over: live from 1 Oct, archive before; upload spend.
5. One-line definition shown on every metric; hide metrics nobody uses.
6. Reconcile October with Aditi's sheet (leads, R1 booked, R1 done, calls) — done when they match.
