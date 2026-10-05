# HiveSchool CRM — what every number means

_How each metric in the CRM is calculated today (6 Oct 2026). Please read, mark anything that
doesn't match how you think about it, and answer the questionnaire at the end._

## Rules that apply everywhere

| Rule | How the CRM does it |
|---|---|
| **Data before / after October** | Up to **Sep 2026** the numbers come from the team's Google Sheets (see *History (sheets)*). From **1 Oct 2026** they come from the CRM. |
| **Calendar** | India time. A day is midnight to midnight IST. |
| **"Reached" a stage** | A lead counts for every stage it passed through, the **first** time it got there. A lead now in R3 also counts as R1 and R2. |
| **Booked** | The day the lead entered the R1 / R2 / R3 stage. |
| **Completed / conducted** | The **interview date**: the panel submitted an outcome (Confirmed / Reject / TBB). |
| **Offer** | The lead received an offer: Offered, Offer accepted, Offer student-reject or Closed–Paid. "Yet to offer" is **not** an offer. |
| **Convert** | The lead reached **Closed–Paid**. |
| **Lost** | Closed–Lost, Closed–Deferred or Closed–Refund. |
| **Spend** | Every rupee spent counts as **inorganic**. Organic = reach that cost nothing (organic spend is ₹0). |
| **Revenue booked** | Fee **excluding GST** of students who converted that month. GST is shown separately. |
| **Revenue realised** | Money that **hit the bank** that month (date hit bank, else paid date). |
| **Past students** | Entered by hand with old dates, so they're left out of marketing funnels and P&L revenue. |
| **"—"** | No data exists. Never shown as 0. |

Sheet months use the sheets' own meaning: R1 / R2 / R3 = interviews **on the calendar** that month,
conducted = interviews held that month.

---

## Admissions

### Admission Analytics
| Metric | Meaning |
|---|---|
| Total leads (organic / inorganic) | Leads created in the date range. |
| R1 / R2 / R3 on calendar | Leads with that round's interview scheduled, or that round's stage entered, inside the range ("Period"). "Pipeline snapshot" = ever. |
| Conducted / No show / Reschedule | Of those: outcome submitted / marked no-show / rescheduled. |
| Moved to next round / Reject / Yet to move | Of conducted: reached the next round / rejected / neither yet. |
| Total offered | Leads that received an offer in the range (see "Offer" above). |
| Closed won / lost | Of those offered: Closed–Paid / Lost. |
| Conversion % (R1→Offer, R1→Convert, Offer→Convert, Lead→Convert) | For **leads created in the range**: how many of them ever reached each stage. Both sides use the same leads. |
| Day-wise grid | Per interview day, by round. |
| Rejection panel | Hive vs student rejections in the range, by the date of rejection: % by reason and by stage. |

### Admissions › All months
| Metric | Meaning |
|---|---|
| Leads | Created in the month. |
| Available | Of those, still open **today**. |
| R1 | Entered an R1 stage in the month. Sheet months: interviews on the calendar. |
| Converts | Leads created in the month that are Closed–Paid now. Sheet months: P&L converts. |
| Lost | Leads created in the month that are lost now. Sheet months: "Closed – Lost". |
| Revenue booked / realised | See the global rules. Sheet months: P&L tabs. |

### Counselor
| Metric | Meaning |
|---|---|
| Total calls, unique leads called, calls / lead, calls / day, pickup %, in / out | Calls logged in the range by that counselor. Pickup = connected ÷ calls. |
| Talk time / day | Total connected call length ÷ days with calls. **Only as good as the call length entered.** |
| Pipeline (R1 booked … convert) | First time a lead reached the stage, inside the range, credited to the lead's **current owner**. |
| Calls → outcome | Leads the counselor called in the range, each counted once at the **furthest** stage reached. % of total dials. |
| R1 split / from R1 % | Of their R1-booked leads: done / no-show / reject / pending; % that reached R2, R3, offer, convert. |
| Avg profile / intent given | Average of the scores that counselor entered. |

### Panel
| Metric | Meaning |
|---|---|
| Booked | Interview **slots** scheduled in the range (all rounds; includes interviews later in the range not yet held). |
| Conducted | An outcome was submitted. |
| Selected / Reject / TBB | Outcome = Confirmed / Reject / TBB. |
| Pending | No outcome yet (includes no-shows, which can't be recorded on the interview today). |
| Offered after / Won after | Of "Confirmed" interviews: the lead later got an offer / paid. |

### Counselor home (Dashboard)
| Metric | Meaning |
|---|---|
| Open / Won / Lost / Win rate | **Current** stage of leads created or edited in the last N + 30 days. |
| New leads | Leads currently New / Lead created / In-funnel. |
| Leads / won / calls per day | Leads created, first Closed–Paid, calls logged — per day. |

### Leads board & lead page
| Metric | Meaning |
|---|---|
| Column counts | Exact number of leads in each stage for the current filters. |
| Card: calls, days called, calls since stage, last call | From call logs. |
| Lead Quality (x/15) | Latest counselor score: Intent + Comms + Profile, 1–5 each, scored after a conversation call while the lead is pre-R1 or R1 Booked. Panel Intent / Profile shown beside it, not added in. |
| Attention list | No contact for N days, unresolved no-show, overdue instalment (provisional rules). |

## Finance
| Page · metric | Meaning |
|---|---|
| Payments · students | Students at Offered, Offer accepted or Closed–Paid with a fee record. |
| Payments · revenue per student | Revenue amount entered, else total fee − remaining. |
| Fee & Loan · month box | Converts = first Closed–Paid that month · booked = their fee (incl. GST, excl. GST beside) · realised = money hit bank that month · loss = fee not received from that month's drop-offs. |

## Marketing
| Page · metric | Meaning |
|---|---|
| Dashboard · sessions, top pages | Website visits from our tracking (from 2 Jul 2026). |
| Dashboard · conversions / conversion rate | Website form leads linked to a visit ÷ sessions (not enrolments; Meta-form leads not included). |
| Funnel · sessions paid / organic | Paid = paid campaign, `utm_medium` paid/cpc/ppc/cpm/paidsocial, or source meta/facebook/google/linkedin-paid. |
| Funnel · leads, R1 → convert | Shared rules above; toggle "date it happened" or "lead created date (cohort)". |
| Funnel · CPL, cost per R1 / R2 / R3 / offer / convert | Spend ÷ that count (organic columns ₹0 by the spend rule). |
| Qualification · AQL | Intent **Good or Maybe** and financial check **Pass**. |
| Attribution / ROI | Leads by first / last touch; R1 = reached R1; enrolled = reached Closed–Paid; revenue = total fee − remaining; ROI CAC = Meta spend ÷ enrolments. |
| Meta ads | Spend, impressions, CTR, CPC; hook rate = 3-second plays ÷ impressions; hold rate = ThruPlays ÷ 3-second plays; Meta leads (Meta's count) vs CRM leads (tagged with the ad). Updates automatically. |
| Channels | Sessions, leads and stages reached, by channel. |
| Marketing P&L | 23 lines: cost per stage = total spend ÷ count; CPA = spend ÷ converts; ARPU = realised ÷ converts; ratios ÷ spend or CPA. |
| All months | Same numbers per month; CAC adds a fixed ₹60,000 "sales cost" (see question 7). |
| Calls (call tracking) | Unchanged, to be discussed: R1 = leads **currently** R1 booked/confirmed; day 1 = calendar day of creation. |
| Forecast | Targets and "actual" are typed in, not calculated. |
| Socials / Calendar | Publish rate = published ÷ (published + missed). |

---

## Questionnaire — only where we need your decision

Tick one per question (or write the answer).

**How we count**
1. **Default date for admissions numbers**: □ lead created date (cohort) everywhere, activity date as a switch · □ keep activity / interview date
2. **Panel "Booked"**: □ count each **lead** once per round · □ count each interview slot (today)
3. **"TBB" outcome**: □ a pass (moved to next round) · □ separate, not a pass
4. **No-shows**: □ let the panelist mark an interview "No show" · □ only via the lead's stage
5. **AQL**: □ intent Good only · □ Good or Maybe (financial check must pass either way)
6. **Paid vs organic, one rule for the whole CRM**: is a website lead that came from a paid ad (`utm_medium = paid`) paid? □ yes · □ no. Are influencer campaigns paid? □ yes · □ no
7. **₹60,000 monthly "sales cost" in All months CAC**: □ remove · □ keep (amount: ____)
8. **Counselor home "Won / Lost / Win rate"**: □ leads created in the chosen period · □ current pipeline snapshot
9. **Attention rules**: no contact after ___ days · unresolved no-show after ___ days · overdue instalment □ yes

**Sheet data (up to Sep 2026): where the tabs disagree**
10. **Converts** don't match across tabs (e.g. Mar 2026: Waterfall 3 · 2026 tab 11 · P&L 5). Which is right? □ P&L tabs (used now) · □ 2026 tab "Closed – Won" · □ Waterfall
11. **Spend**: □ P&L "Grand total" (ads + agency + GST + influencers + PR + production, no salaries; used now) · □ Waterfall Meta + non-Meta. Should salaries be included? □ yes · □ no
12. **Leads Jun / Jul 2026**: Waterfall 280 / 211 (Jul only to 13th) vs 2026 tab 155 / 606. Which is right? ____
13. **Sep 2025 leads** show **0** in the sheet: real, or not filled in?
14. **C3 P&L Apr 2026 revenue booked**: "26.6 L (as on 12 May)" vs ₹2,66,000 in the total row. Which is right?
15. **Missing in the sheets**, please send: leads + spend for **Aug and Sep 2026**, the **July 2026** interview tab, revenue after **Apr 2026**.
16. **Daily vs monthly** in the admissions sheet: Jan 2026 R1 on calendar = 103 (daily rows) vs 99 (monthly total); Jun 2026 daily tab looks incomplete. Use □ monthly totals · □ daily rows
