# Deep test — 6 Oct 2026 (IST)

Read-only against production. Ground truth for today (6 Oct), yesterday (5 Oct), last 7 days (30 Sep–6 Oct) and month-to-date (1–6 Oct) is in `tmp/ground-truth.json`. No rows were written. Call Tracking (`/marketing/calls`) was not changed.

## 1. Bug table

| id | page / flow | role | what the user sees | what is correct | root cause | fix | data fix? |
|---|---|---|---|---|---|---|---|
| B1 | Admissions Analytics organic/inorganic vs Marketing funnel / Channels / lead card | admin, marketing, counselor | 1–6 Oct, 213 leads created. Admissions organic **125** / inorganic **88**. Marketing organic **130** / inorganic **83**. Seven of those leads are a Facebook visit with `utm_medium=paid` and a blank `utm_medium` on the lead. Five have no first-touch campaign and a last-touch `paid_ad` campaign (Admissions already counts them inorganic; Marketing does not). Two have no campaign at all (both pages count them organic). | Organic **123**, inorganic **90** on every page. A visit with `utm_medium=paid` is inorganic. | Marketing `isInorganicLead` only saw the lead row and the first-touch campaign (`funnel-engine.ts` RPC `campaign_source_type`, `fetchAttributionForLeads` selected only `first_touch_campaign_id`). Admissions `classifyLeadSource` treated `source=website` as organic and never read the visit. | Use the linked session’s UTM, and the last-touch campaign when first touch is missing. Applied in this change. | N |
| B2 | Marketing → All months, and the nightly cache warm | admin, marketing | Between 00:00 and 05:30 IST the “live” month is the previous UTC month. Not visible at 18:00 IST on 6 Oct; it is the next time the UTC date lags India (e.g. 00:30 IST on 1 Nov is still 31 Oct UTC). | Month keys from `istMonthKey` / `istParts`. | `fetchMonthlyMarketingDataUncached` and `marketing-warm` used `Date#getMonth()` (server local). | Switched those two to the IST helpers. | N |

### Checked and not a code bug

- **Panel outcomes, 1–6 Oct:** 12 interviews on the calendar (R1 9, R2 2, R3 1), every `outcome` is null. Conducted **0** matches the definition (outcome submitted). Pending is the data, not the formula.
- **Owner scope:** 1,705 assigned leads; 0 sit outside the owner’s `counselor_scope`.
- **Duplicate stage rows** for R1 / offer / paid in October: 0.
- **Duplicate phones** among leads created 30 Sep–6 Oct: 0.
- **Fee records:** 0 rows. Payments / booked revenue are empty because nothing has been entered, not because the month box uses the wrong date.
- **Open stock (not date-filtered):** Shreya 712, Aditi 709.

## 2. Inconsistency table (Pass 2)

Same label, 1–6 Oct 2026, leads created in the window.

| metric | entity | period | place A | place B | after this fix |
|---|---|---|---|---|---|
| Organic leads | all leads created | 1–6 Oct | Admissions Analytics 125 | Marketing funnel 130 | both **123** |
| Inorganic leads | same | 1–6 Oct | Admissions 88 | Marketing 83 | both **90** |
| R1 booked | Aditi | 5 Oct | by current owner **3** | by who booked it **4** (Nikhil booked one) | not changed — see business decisions |
| R1 booked | Aditi | 1–6 Oct | by owner **5** | by who booked it **7** | not changed |

Counselor page label already says “R1 booked credited to who booked it”. The definitions note says current owner. Those two sentences disagree; the screen does not show both numbers at once.

### Ground truth the screens should match

Calls are logged calls in the window. Pickup = connected ÷ calls (connected = outcome connected/completed, or duration > 0). Stage counts are the first history row in the window, not “currently in that stage”.

**Today 6 Oct**

| | leads | sessions (paid / organic) | spend | R1 stage entries |
|---|---|---|---|---|
| | 15 | 503 (416 / 87) | ₹18,742 | 2 |

| counselor | calls | unique leads | connected | pickup | created + assigned |
|---|---|---|---|---|---|
| Aditi | 119 | 60 | 34 | 28.6% | 5 |
| Shreya | 86 | 48 | 22 | 25.6% | 10 |

R1 booked today: Shreya 1, Aditi 1 (owner and booker agree).

**Yesterday 5 Oct** — 38 leads, 1,034 sessions (830 paid / 204 organic), spend ₹27,843, R1 stage entries 7.

| counselor | calls | unique leads | pickup | created + assigned |
|---|---|---|---|---|
| Shreya | 123 | 73 | 34.1% | 21 |
| Aditi | 101 | 54 | 18.8% | 17 |

**1–6 Oct** — 213 leads, spend ₹152,665. R1 first entries 12 (booker: Aditi 7, Shreya 4, Nikhil 1). Interviews scheduled 12, outcomes submitted 0. 27 leads have no course.

## 3. Unanswered questions (Pass 3)

The pages can answer these once the date range is 1 Oct–today. They could not, before this fix, agree on organic vs paid.

- How many R1s did Aditi book yesterday? **4** (she owns 3). The counselor page credits the booker; nothing on that page also shows the owner count.
- Which interviews are missing an outcome? All **12** scheduled 1–6 Oct. The panel page’s Pending column is that list. There is still no “No show” outcome on the interview itself (questionnaire 4).
- How much fee is outstanding for a cohort? **Cannot answer.** `fee_records` is empty.
- What did a Meta lead cost this week? Spend is in `ad_spend_daily` (6 Oct ₹18,742). Cost per lead needs the organic/inorganic split, which B1 was distorting by 7 leads.

Not click-tested in the browser this pass: every filter on every marketing page, counselor home charts, and the leads board column totals. Numbers above are from the tables and the functions those pages call.

## 4. Role × action

Not executed against seeded users. Production writes were not run. From code and RLS:

- Analytics, funnel, and this paid/organic fix use the service-role client after `requireUser`. Counselors do not call those admin aggregates.
- `visitor_sessions` select allows admin/marketing, or a counselor when `session_linked_to_accessible_lead`. Lead cards for a counselor therefore get the visit medium only when that link matches. The admin analytics path does not depend on that.
- 0 assigned leads are outside the owner’s cohort scope, so the usual “saved but 0 rows” scope miss is not showing up in current data.

A full ✅ / ❌ matrix of every action in `src/app/actions` still needs a local database and one user per role. That was not run here.

## 5. Business decisions — not changed

From `docs/crm-metric-definitions.md` questionnaire, still open:

1. Default date basis (created vs activity).
2. Panel “Booked” = slots (current) vs one lead per round.
3. Whether TBB counts as a pass.
4. Whether a panelist can mark No show.
5. AQL = Good only, or Good or Maybe.
6. Influencer campaigns: Admissions still treats `campaign source_type=influencer` as inorganic. Marketing does not, unless the UTM or source text is paid. Left as-is.
7. ₹60,000 sales cost inside All-months CAC (`liveCac` in `fetchMonthlyMarketingData`). Left as-is.
8. Counselor home Won / Lost is still the current stage of leads created **or edited** in the last N+30 days. The daily “won” chart uses the first Closed–Paid, which matches the definitions note.
9. Attention-list day counts.
10. Which sheet tab wins where the archive disagrees.

Also left: R1 on the counselor page stays credited to who booked it, because the on-screen label says so. The definitions sentence that says “current owner” should be updated if that label is what the team wants.

## What was verified after the fix

`npx tsc --noEmit -p .`, eslint on the edited files, and `npx next build` passed. Running the two page functions for 1–6 Oct returned the same split: Admission Analytics `leadTotals` 213 / organic 123 / inorganic 90, and the Marketing funnel day rows summed to the same 213 / 123 / 90. The shared engine reclassified 11 leads in that activity window (including leads created earlier) that the old rule had left organic.
