# Metric logic audit — is each number calculated correctly?

_Read from the code on 5 Oct 2026 (main @ b4e77a1). No changes made._

**Short answer: no.** Some formulas are right, but the dashboards don't agree with each
other because the same metric is calculated with different rules on different pages. On
top of that there are a few real bugs, and some definitions the team never fixed.

Legend: ✅ correct for what it says · ⚠️ inconsistent with other pages · ❌ bug · ❓ needs a team decision

---

## 1. The three root causes of "the numbers don't match"

### 1a. Different date rules for the same metric ⚠️
| Page | "R1" counted by |
|---|---|
| Admission Analytics (period) | stage entered **or** interview scheduled in the range (calendar) |
| Panel | interview **scheduled** in the range (each booking slot, not each lead) |
| Admissions · All months | R1 stage entered in the month |
| Marketing · Leads funnel | first R1 stage entry (event) — or lead created date (cohort toggle) |
| Marketing · Channels | lead created in range **and currently sitting** in an R1 stage |
| Counselor | first R1 stage entry in range |
| Calls (not touched) | lead created that day **and currently** R1 booked/confirmed |

Team expectation (Nikhil, 5 Oct call): **everything by lead created date** ("the source
always remains the lead creation date"). Only the Leads funnel cohort toggle does that today.
This alone explains "16 R1s on Panel vs 9 the team counts".

### 1b. Two different organic / paid rules ⚠️
- **Admission Analytics, lead cards** (`classifyLeadSource`): paid only if the matched campaign
  is paid/influencer, or `source` mentions meta/facebook/paid. **Website leads with
  `utm_medium=paid` count as organic.**
- **Marketing pages** (`isInorganicLead`): paid if first-touch campaign is paid, or
  `utm_medium` is paid/cpc/ppc/cpm/paidsocial, or source matches meta/facebook/google/linkedin-paid.
  Influencer campaigns count as organic.

The same lead can be organic on one page and paid on the other.

### 1c. Four different "revenue" calculations ⚠️
| Page | Booked | Realised | Dated by |
|---|---|---|---|
| Marketing P&L / Marketing All months | fee excl. GST of students who converted that month | money hit bank (date hit bank, else paid date) | event ✅ |
| Admissions · All months | `total_fee` (incl. GST?) | `revenue_amount` or total − remaining | **last edit of the fee record** ❌ |
| Admin · Revenue | `total_fee` | instalments `amount_realised` | fee set date / paid date |
| Fee & Loan tracker | its own deal stages | `amount_hit_bank` | date hit bank |

---

## 2. Page by page

### Admission Analytics (`admissions-funnel.ts`)
| Metric | Verdict | What the code does |
|---|---|---|
| Total leads, organic / inorganic | ✅ / ⚠️ | created in range; split uses rule 1b (admissions version) |
| R1/R2/R3 on calendar (period) | ⚠️ | stage entered **or** interview scheduled in range — mixes two dates |
| Conducted | ⚠️ | outcome submitted, or stage confirmed/reject; a lead that went straight from R1 booked → R2 booked without an R1 outcome is **not** conducted |
| Moved to next round | ✅ | ever reached a later round |
| Total offered | ❌ | includes **Yet to offer**, Closed–Deferred and Closed–Refund leads who were never offered |
| Closed won / lost | ⚠️ | lost = deferred + refund + lost |
| Conversion % (R1→Offered, R1→Convert, …) | ❌ | **numerator and denominator use different bases**: R1 count = leads *created* in range; Offered = offers *happening* in range (any lead). Can exceed 100% / be meaningless |
| Day-wise grid | ✅ | per interview day |

### Admissions · All months (`admissions.ts → fetchAdmissionsMonthlyRollup`)
| Metric | Verdict | What the code does |
|---|---|---|
| Leads | ✅ | created in month |
| Available leads | ✅ (snapshot) | of those, still open **today** |
| R1 booked | ⚠️ | R1 stage entered in month (event) — different basis from Leads on the same row |
| Converts | ⚠️ | leads created in month whose **current** stage is Closed–Paid |
| Lost | ❌ | only **Closed–Deferred**; Closed–Lost and Closed–Refund are ignored |
| Revenue booked / realised | ❌ | dated by the fee record's **last edit**; booked uses total_fee (GST unclear) |

### Panel (`panel-performance.ts`)
| Metric | Verdict | What the code does |
|---|---|---|
| Booked | ❓ | interview **slots** scheduled in range (incl. future ones, all rounds); one lead can count twice. Date-range end fixed today |
| Conducted | ✅ | an outcome was submitted (Confirmed / Reject / TBB) |
| No show / Pending | ❌ | an interview can't be marked no-show (only Confirmed / Reject / TBB exist), so no-shows stay **Pending forever** and the No-show column is always 0 |
| Selected | ❓ | outcome "confirmed" only. But "TBB" moves the lead to the next round (R1 TBB → R2 booked), so it is also a pass — currently **not** counted as selected and gets no offer/won credit |
| Offered after / Won after | ⚠️ | only for "confirmed" outcomes; leads offered with no history get a made-up offer date (start of range) |

### Counselor dashboard (`counselor-performance.ts`)
| Metric | Verdict | What the code does |
|---|---|---|
| Calls, unique leads called, pickup %, avg/day | ✅ | calls in range by the counselor who logged them |
| Talk time | ✅ formula / ❌ data | only 2 of 332 connected calls in Sep had a length |
| Pipeline (R1/R2/R3/offer/convert) | ✅ | first time reached in range, credited to current owner (agreed) |
| Calls → outcome table | ✅ | % of dials, furthest stage reached (agreed) |
| Allocated · created in range | ✅ | created in range and has an owner now |

### Counselor home (`rpc_counselor_home_v2`)
| Metric | Verdict | What the code does |
|---|---|---|
| Won per day | ❌ | leads currently Closed–Paid, dated by **last edit** |
| Stage counts | ✅ (snapshot) | current stage |

### Marketing · Leads funnel (`fetchLeadFunnelUncached` + funnel engine)
| Metric | Verdict |
|---|---|
| Sessions, paid / organic sessions | ✅ (paid rule = marketing version 1b) |
| Leads, org / inorg | ✅ |
| R1/R2/R3 booked & completed, offer, convert | ✅ first time reached; event or cohort toggle |
| Spend (organic / inorganic / total) | ✅ per team rule (all spend inorganic) — but **spend data not uploaded** |
| CPL, cost per R1/R2/R3/offer/convert | ✅ (blank where spend is missing) |
| AQL | ✅ aql_at, else created date when intent + financial check qualify |

### Marketing · Channels (`fetchChannelFunnelUncached`)
| Metric | Verdict | What the code does |
|---|---|---|
| R1 / R2 / R3 / Offer | ❌ | leads whose **current** stage is in that round — a lead now in R2 is not counted in R1; a rejected/closed lead counts nowhere |
| Offer | ❌ | includes Yet to offer |
| Forms | ⚠️ | identical to Leads |

### Marketing · P&L (`pnl-monthly.ts`) — ✅
Formulas match the agreed list. Before July 2026 it shows the sheet; **July–Sept still use CRM
data**, which the team says is wrong → to move to archive.

### Marketing · Meta ads, rejection %, sessions split — ✅
Correct for what they say (Meta needs a working token + sync).

### Calls / Call tracking — not changed (agreed). Known: R1 = current stage only.

---

## 3. Decisions the team has to make (the questionnaire)
1. **One date rule for admissions metrics** — lead created date (cohort) everywhere, with
   "by meeting date" only as an optional view? (Nikhil: yes, lead created date.)
2. **R1 "booked"** — count each **lead** once, or each interview **slot**? Include interviews
   later in the month that haven't happened yet?
3. **Panel outcomes** — is "TBB" a pass (moved to next round)? Should no-shows be recorded on the interview (so they leave "Pending")?
4. **Offered** — only Offered / Accepted / Closed–Paid, or also "Yet to offer"?
5. **Lost** — Closed–Lost only, or also Deferred and Refund?
6. **Organic vs paid** — one rule for the whole CRM. Is a website lead that came from a paid ad
   (utm_medium = paid) paid? Are influencer campaigns paid?
7. **Revenue** — one definition: booked = fee excl. GST at conversion month, realised = date hit
   bank (as in the P&L)?
8. **Cut-over** — CRM data from 1 Oct 2026; everything before from the sheets (Jul–Sep sheets needed)?

## 4. Recommended fix order
1. Team answers section 3 (one call).
2. One shared definition per metric (the funnel engine already does R1→Convert; extend it with
   the answers) and make **every page call it** — Admission Analytics, All months, Panel,
   Channels, Counselor home.
3. Fix the ❌ bugs above as part of that.
4. One organic/paid rule and one revenue rule, used everywhere.
5. Cut over to "live from 1 Oct, sheets before"; upload spend; add a one-line definition on
   every metric.
6. Reconcile October with Aditi's sheet (R1s, leads, calls) before calling it done.
