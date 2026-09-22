# Meeting CRM changes — audit + implementation report

Generated from live code audit vs founder/admissions meeting list.  
**Inputs missing:** WhatsApp reject list (input 1), Excel fee/loan columns (input 2).

## Audit table (post-implementation status)

| ID | Status | Evidence | What was missing / done |
|----|--------|----------|-------------------------|
| CE-1 | DONE-PARTIAL→built | `counselor-performance.ts` uniqueCalls = distinct lead_id | Was total calls; now unique leads called |
| CE-2 | DONE-PARTIAL | Total calls + team rollup exist; per-day series not built | Range totals OK; daily series deferred |
| CE-3 | DONE-FULL | avgCallsPerDay counselor + team | — |
| CE-4 | DONE-PARTIAL | Lead card + detail call counts; scorecard avg | Per-lead list on scorecard still light |
| CE-5 | DONE-FULL | avgCallsPerLead + team | — |
| CE-6 | DONE-PARTIAL→built | pickupRatePct, connected/not | Added to lib + admin counselor UI |
| CE-7 | DONE-PARTIAL→built | totalTalkSec | Sum of connected durations in range |
| CE-8 | DONE-PARTIAL→built | avgDailyTalkSec (hrs in UI) | Avg of daily talk totals |
| CE-9 | DONE-PARTIAL→built | direction column + inbound metrics | Needs migration; inbound data only when logged |
| CE-10 | NOT DONE (CONFIRM) | No region field | Do not invent |
| CP-1 | DONE-PARTIAL→built | nurturing, rejects, hive/student on pipeline | Expanded stage counts |
| CP-2 | DONE-PARTIAL→built | Team rollup of new fields | Same |
| PD-1 | DONE-FULL | admin/panel totals | — |
| PD-2 | DONE-PARTIAL→built | Booked/Done/Sel per R1–R3 | Was sel/cond only |
| PD-3 | DONE-PARTIAL→built | feedback_notes on lead detail | Was saved but not shown |
| PD-4 | NOT DONE (CONFIRM) | No payout fields | Do not build |
| SC-1 | DONE-PARTIAL | `recordLeadStageScore` + `lead_stage_scores` | UI gate on R1 book not fully wired |
| SC-2 | DONE-PARTIAL | score action + feedback required in action | InterviewsClient mandatory UI incomplete |
| SC-3 | DONE-PARTIAL→built | lead_stage_scores append-only table | Migration required |
| SC-4 | DONE-PARTIAL→built | avg on RejectionFunnelPanel | Per counselor/panelist rollup light |
| SC-5 | DONE-FULL | Convert % on lead | — |
| FN-1 | DONE-PARTIAL→built | Retarget off board; stages kept for data | Admission reject stays as disposition column |
| FN-2 | DONE-PARTIAL | Funnel manager exists | Exact 7-stage simplification not forced |
| FN-3 | DONE-PARTIAL→built | Interviews / Offered / Closed sections | Board regrouped |
| FN-4 | DONE-PARTIAL→built | offered_accepted → Closed | Closed list listed below for CONFIRM |
| FN-5 | DONE-PARTIAL→built | Student reject under Offered | Hint fixed |
| FN-6 | DONE-PARTIAL→built | reject_kind + reject_at_stage | Migration |
| FN-7 | DONE-PARTIAL→built | Student + hive reason dialogs | Server enforce |
| FN-8 | DONE-PARTIAL→built | Label/hint updated | — |
| FN-9 | DONE-PARTIAL→built | StageRejectDialog on drag | Portal z-100 |
| FN-10 | NOT DONE (CONFIRM) | No frequency field | Note only |
| RR-1 | DONE-PARTIAL | Existing admission list | **Cannot verify vs WhatsApp list** |
| RR-2 | DONE-FULL | No “30 years” in selectable list | Hidden list constant added |
| RR-3 | DONE-FULL | Custom option | — |
| RR-4 | DONE-PARTIAL→built | STUDENT_REJECTION_REASONS + dialog | Autocomplete of past “joined elsewhere” deferred |
| RR-5 | DONE-PARTIAL | Columns no_show_* added | UI on mark no-show not finished |
| RR-6 | DONE-PARTIAL→built | Server for student/hive rejects | No-show enforce pending UI |
| AN-1 | DONE-PARTIAL→built | RejectionFunnelPanel | Needs reject_kind data after migration |
| AN-2 | DONE-PARTIAL→built | Offered accepted/reject/pending in panel | — |
| AN-3 | DONE-PARTIAL→built | Avg scores on rejection panel | — |
| AN-4 | DONE-PARTIAL | Date filters exist on analytics | Applied to rejection fetch |
| PY-1 | DONE-PARTIAL | Pipelines exist | Cohort loan amt gaps remain |
| PY-2 | NOT DONE | Excel not provided | Cannot compare |
| PY-3 | DONE-PARTIAL | Installments exist | Pipeline summary columns deferred |
| PY-4 | DONE-PARTIAL | Cohort filters | Created-date range on payments deferred |
| US-1 | DONE-PARTIAL | Users CRUD; View as; must_change_password | Dual role impossible; Aditi not seeded here |
| US-2 | DONE-FULL | Auto alloc + bulk assign | — |
| US-3 | DONE-FULL | Created From/To on leads | — |
| US-4 | DONE-PARTIAL | Stage email triggers | Dedicated offer letter UX incomplete |
| US-5 | DONE-PARTIAL | Templates in config | Preview polish deferred |
| OP-1 | NOT DONE | Suggest only | Bulk stage move not built (<1h risk to data) |

## CONFIRM assumptions

1. **FN-4 Closed today:** Student Reject (now Offered section), Offer accepted, Closed Paid/Deferred/Refund/Lost. Did **not** create “postpaid” / “closed effort”.
2. **CE-10 / region:** No field — skipped.
3. **PD-4 panelist finances:** No field — skipped.
4. **US-1 dual role:** Single role enum — keep admin + View as for calling.
5. **RR-1:** Used existing hardcoded Hive reasons until WhatsApp list is pasted.
6. **PY-2:** Excel columns missing — skipped parity.

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

1. **Calling still works:** Lead → Calling → Log a call (manual). Confirm history updates.
2. **Hive reject drag:** Board → drag to Admission Team Rejected → reason modal must appear → Confirm → stage updates.
3. **Student reject drag:** Drag to Student Reject → pick Ghosted (or Joined elsewhere + where) → Confirm.
4. **Cancel reject:** Open modal → Cancel → lead stays on previous column.
5. **Counselor scorecard:** Admin → Counselor → see Unique leads, Pickup %, Talk/day, In/Out, Nurture/Hive/Stu rej.
6. **Panel by round:** Admin → Panel → Booked / Done / Sel per R1–R3.
7. **Lead feedback:** Complete an interview with notes → open lead → Interviews → see Feedback line.
8. **Analytics rejection:** Admin → Analytics → Rejection funnel panel under round matrices.
9. **Password change:** Set `must_change_password=true` on a user → login → forced password modal.
10. **View as:** Users → View as counselor → new tab; admin tab stays logged in.

## Still incomplete (needs next pass or inputs)

- SC-1/SC-2 UI wiring on Book interview + panel outcome forms
- RR-5 no-show reason UI
- PY date-range filter + Excel parity
- CE-9 real inbound telephony events
- WhatsApp reject list sync (RR-1)
- Dual-role for Aditi (product decision)
