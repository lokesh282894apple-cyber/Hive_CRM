# Meeting CRM changes — audit + implementation report

Generated from live code audit vs founder/admissions meeting list.  
**Inputs missing:** WhatsApp reject list (input 1), Excel fee/loan columns (input 2).

## Audit table (post-implementation status)

| ID | Status | Evidence | What was missing / done |
|----|--------|----------|-------------------------|
| CE-1 | DONE-FULL | `counselor-performance.ts` uniqueCalls | Distinct leads/day |
| CE-2 | DONE-FULL | Total calls + team rollup | — |
| CE-3 | DONE-FULL | avgCallsPerDay counselor + team | — |
| CE-4 | DONE-PARTIAL | Lead card + avgCallsPerLead | Per-lead list on scorecard still light |
| CE-5 | DONE-FULL | avgCallsPerLead + team | — |
| CE-6 | DONE-FULL | pickupRatePct | — |
| CE-7 | DONE-FULL | totalTalkSec | — |
| CE-8 | DONE-FULL | avgDailyTalkSec | — |
| CE-9 | DONE-PARTIAL | direction + inbound metrics | Needs real inbound telephony events |
| CE-10 | NOT DONE (CONFIRM) | No region field | Do not invent |
| CP-1 | DONE-FULL | Expanded pipeline counts | — |
| CP-2 | DONE-FULL | Team rollup | — |
| PD-1 | DONE-FULL | admin/panel totals | — |
| PD-2 | DONE-FULL | Booked/Done/Sel per R1–R3 | — |
| PD-3 | DONE-FULL | feedback on lead + panelist link | — |
| PD-4 | NOT DONE (CONFIRM) | No payout fields | Do not build |
| SC-1 | DONE-FULL | R1 book UI + server enforce | BookInterviewDialog/Client + interviews.ts |
| SC-2 | DONE-FULL | Panel outcome scores + feedback | InterviewsClient + submitInterviewOutcome |
| SC-3 | DONE-FULL | lead_stage_scores append-only | Migration |
| SC-4 | DONE-FULL | Analytics + counselor + panelist avgs | — |
| SC-5 | DONE-FULL | Convert % on lead | — |
| FN-1–FN-9 | DONE-FULL | Board regroup + reject dialogs | — |
| FN-10 | NOT DONE (CONFIRM) | No frequency field | Note only |
| RR-1 | DONE-PARTIAL | Existing Hive list | Wait for WhatsApp paste |
| RR-2 | DONE-FULL | Hidden “30 years” reasons | — |
| RR-3 | DONE-FULL | Custom option | — |
| RR-4 | DONE-FULL | Student reasons + dialog | — |
| RR-5 | DONE-FULL | NoShowDialog + server + booking cols | — |
| RR-6 | DONE-FULL | Server enforce rejects + no-show | — |
| AN-1 | DONE-FULL | RejectionFunnelPanel + no-shows | — |
| AN-2 | DONE-FULL | Offered outcomes | — |
| AN-3 | DONE-FULL | Avg scores | — |
| AN-4 | DONE-FULL | Date filters applied | — |
| PY-1 | DONE-FULL | Payments + loans pipelines | — |
| PY-2 | NOT DONE | Excel not provided | Cannot compare |
| PY-3 | DONE-FULL | Installment summary on pipeline | Booked/EMIs/collected/outstanding |
| PY-4 | DONE-FULL | Created from/to + cohort filters | — |
| US-1 | DONE-PARTIAL | must_change_password; View as | Dual role impossible; no seed here |
| US-2 | DONE-FULL | Auto alloc + bulk assign | — |
| US-3 | DONE-FULL | Created From/To on leads | — |
| US-4 | DONE-FULL | Offer template on stage + resend + status | — |
| US-5 | DONE-FULL | TriggerRulesPanel HTML preview | — |
| OP-1 | DONE-FULL | List multi-select + bulk stage move | — |

## CONFIRM assumptions

1. **FN-4 Closed today:** Offer accepted, Closed Paid/Deferred/Refund/Lost. Did **not** create “postpaid” / “closed effort”.
2. **CE-10 / region:** No field — skipped.
3. **PD-4 panelist finances:** No field — skipped.
4. **US-1 dual role:** Single role enum — keep admin + View as for calling.
5. **RR-1:** Used existing hardcoded Hive reasons until WhatsApp list is pasted.
6. **PY-2:** Excel columns missing — skipped parity.
7. **SC-1:** Required for counselor/admin on **new** R1 bookings only (not reschedule).

## Migrations (backward-compatible)

File: `supabase/migrations/20260922120000_meeting_followups.sql`

- ADD `leads.reject_kind`, `reject_at_stage`, `reject_reason_category`
- CREATE `lead_stage_scores` (append-only)
- ADD `call_logs.direction` (default outbound backfill)
- ADD `interview_bookings.no_show_informed`, `no_show_reason`
- ADD `users.must_change_password`
- UPDATE funnel: `offered_accepted` → closed group; retarget `show_on_board=false`; reject stages `requires_reason=true`

**Run this on production Supabase before relying on new metrics/rejects.**

## Manual test script

1. **Calling:** Lead → Calling → Log a call. History updates.
2. **R1 book scores:** Book R1 without scores → blocked. Fill profile/intent/notes → books.
3. **Panel outcome:** Panelist → Submit without feedback/scores → blocked. Fill all → saves; open lead → Feedback visible.
4. **No-show:** Lead → R1 No Show → pick Ghosted or Informed + reason → stage updates.
5. **Hive/Student reject drag:** Reason modal required before move.
6. **Counselor scorecard:** Unique leads, Pickup %, Talk/day, Avg profile/intent.
7. **Panel:** Booked/Done/Sel + avg scores.
8. **Payments:** Set Created from/to + cohort; see EMI booked/collected/outstanding.
9. **Bulk stage:** Leads list → select rows → pick stage → Move.
10. **Offer email:** Offered lead → see send status → Send / resend offer email.
11. **Templates:** Admin → Config → WA + Email triggers → readable HTML preview.
12. **Password:** `must_change_password=true` → forced change modal.

## Still blocked on inputs / product decisions

- WhatsApp reject list sync (RR-1)
- Excel column parity (PY-2)
- Dual-role for Aditi (product)
- Region / panelist pay / lead frequency (CONFIRM — not invented)
- Live inbound call events for CE-9
