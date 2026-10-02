/**
 * Marketing P&L — one column per IST month.
 *
 * Live months reuse the Leads funnel (fetchLeadFunnel, event basis) for
 * sessions, leads, every funnel count and spend, so the P&L and the Leads
 * dashboard can never disagree. Revenue:
 *  - Booked   = fee of students who converted (first closed_paid) that month,
 *               excluding GST; GST shown on its own line (team decision).
 *  - Realised = money that hit the bank that month (date hit bank, else the
 *               paid date) — see realisedRevenueByMonth.
 *  - ARPU     = Realised ÷ converts.
 * Months before the CRM had its own data come from the archived sheet
 * (marketing_monthly_archive). Anything that can't be computed is null → "—".
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchLeadFunnel } from "@/lib/marketing/dashboard-queries";
import { cachedMarketingQuery, MARKETING_CACHE_TAGS } from "@/lib/marketing/query-cache";
import { bookedRevenueByConvertMonth, realisedRevenueByMonth } from "@/lib/analytics/revenue-events";
import { istEndIso, istStartIso, monthLastDay } from "@/lib/tz";

/** First month the CRM tracks sessions, spend and the funnel itself. */
export const PNL_LIVE_FROM_MONTH = "2026-07";

export const PNL_LINES = [
  { key: "sessions", label: "Sessions", kind: "count" },
  { key: "leads", label: "Leads", kind: "count" },
  { key: "costR1Booked", label: "Cost / R1 Booked", kind: "inr" },
  { key: "costR1Completed", label: "Cost / R1 Completed", kind: "inr" },
  { key: "costR2Booked", label: "Cost / R2 Booked", kind: "inr" },
  { key: "costR2Completed", label: "Cost / R2 Completed", kind: "inr" },
  { key: "costR3Booked", label: "Cost / R3 Booked", kind: "inr" },
  { key: "costR3Completed", label: "Cost / R3 Completed", kind: "inr" },
  { key: "costOffer", label: "Cost / Offer", kind: "inr" },
  { key: "cpa", label: "CPA", kind: "inr" },
  { key: "organicSpend", label: "Organic Spend", kind: "inr" },
  { key: "inorganicSpend", label: "Inorganic Spend", kind: "inr" },
  { key: "totalSpend", label: "Total Spend", kind: "inr" },
  { key: "revenueBooked", label: "Revenue Booked (excl. GST)", kind: "inr" },
  { key: "gstBooked", label: "GST on booked fees", kind: "inr" },
  { key: "revenueRealised", label: "Revenue Realised", kind: "inr" },
  { key: "revBookedToSpendPct", label: "Rev Booked : Total Spend %", kind: "pct" },
  { key: "revRealisedToSpendPct", label: "Rev Realised : Total Spend %", kind: "pct" },
  { key: "arpu", label: "ARPU", kind: "inr" },
  { key: "arpuToCpaPct", label: "ARPU : CPA %", kind: "pct" },
  { key: "arpuBooked", label: "ARPU Booked", kind: "inr" },
  { key: "arpuRealised", label: "ARPU Realised", kind: "inr" },
  { key: "arpuBookedToCpaPct", label: "ARPU Booked : CPA %", kind: "pct" },
  { key: "arpuRealisedToCpaPct", label: "ARPU Realised : CPA %", kind: "pct" },
] as const;

export const PNL_COUNT_LINES = [
  { key: "r1Booked", label: "R1 Booked" },
  { key: "r1Completed", label: "R1 Completed" },
  { key: "r2Booked", label: "R2 Booked" },
  { key: "r2Completed", label: "R2 Completed" },
  { key: "r3Booked", label: "R3 Booked" },
  { key: "r3Completed", label: "R3 Completed" },
  { key: "offer", label: "Offers" },
  { key: "convert", label: "Converts" },
] as const;

export type PnlLineKey = (typeof PNL_LINES)[number]["key"];
export type PnlCountKey = (typeof PNL_COUNT_LINES)[number]["key"];

export type PnlMonth = {
  month: string;
  source: "live" | "archive" | "none";
  /** Archive month only covers part of the month (sheet "till 13th") */
  partial: boolean;
  values: Record<PnlLineKey, number | null>;
  counts: Record<PnlCountKey, number | null>;
  /** Archive extras (sheet notes) */
  archive?: { activations: string | null; note: string | null };
};

const div = (a: number | null, b: number | null) => (a != null && b != null && b > 0 ? a / b : null);
const pctOf = (a: number | null, b: number | null) => {
  const v = div(a, b);
  return v == null ? null : v * 100;
};

export function monthKeysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  for (let i = 0; i < 60; i++) {
    const k = `${y}-${String(m).padStart(2, "0")}`;
    if (k > to) break;
    out.push(k);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function derive(base: {
  sessions: number | null;
  leads: number | null;
  counts: Record<PnlCountKey, number | null>;
  organicSpend: number | null;
  inorganicSpend: number | null;
  totalSpend: number | null;
  revenueBooked: number | null;
  gstBooked: number | null;
  revenueRealised: number | null;
}): Pick<PnlMonth, "values" | "counts"> {
  const c = base.counts;
  const spend = base.totalSpend;
  const cpa = div(spend, c.convert);
  const arpuBooked = div(base.revenueBooked, c.convert);
  const arpuRealised = div(base.revenueRealised, c.convert);
  return {
    counts: c,
    values: {
      sessions: base.sessions,
      leads: base.leads,
      costR1Booked: div(spend, c.r1Booked),
      costR1Completed: div(spend, c.r1Completed),
      costR2Booked: div(spend, c.r2Booked),
      costR2Completed: div(spend, c.r2Completed),
      costR3Booked: div(spend, c.r3Booked),
      costR3Completed: div(spend, c.r3Completed),
      costOffer: div(spend, c.offer),
      cpa,
      organicSpend: base.organicSpend,
      inorganicSpend: base.inorganicSpend,
      totalSpend: spend,
      revenueBooked: base.revenueBooked,
      gstBooked: base.gstBooked,
      revenueRealised: base.revenueRealised,
      revBookedToSpendPct: pctOf(base.revenueBooked, spend),
      revRealisedToSpendPct: pctOf(base.revenueRealised, spend),
      arpu: arpuRealised,
      arpuToCpaPct: pctOf(arpuRealised, cpa),
      arpuBooked,
      arpuRealised,
      arpuBookedToCpaPct: pctOf(arpuBooked, cpa),
      arpuRealisedToCpaPct: pctOf(arpuRealised, cpa),
    },
  };
}

type ArchiveRow = {
  month_key: string;
  is_partial: boolean;
  meta_spend: number | null;
  non_meta_spend: number | null;
  active_users_total: number | null;
  leads_total: number | null;
  r1: number | null;
  r2: number | null;
  r3: number | null;
  offered: number | null;
  converts_total: number | null;
  activations: string | null;
  import_note: string | null;
};

const numOrNull = (v: unknown) => (v == null ? null : Number(v));

async function fetchMarketingPnlUncached(fromMonth: string, toMonth: string): Promise<PnlMonth[]> {
  const admin = createAdminClient();
  const months = monthKeysBetween(fromMonth, toMonth);
  const liveMonths = months.filter((m) => m >= PNL_LIVE_FROM_MONTH);
  const archiveMonths = months.filter((m) => m < PNL_LIVE_FROM_MONTH);

  const archiveP = archiveMonths.length
    ? admin
        .from("marketing_monthly_archive")
        .select(
          "month_key, is_partial, meta_spend, non_meta_spend, active_users_total, leads_total, r1, r2, r3, offered, converts_total, activations, import_note"
        )
        .in("month_key", archiveMonths)
        .then((r) => (r.error ? [] : ((r.data ?? []) as ArchiveRow[])))
    : Promise.resolve([] as ArchiveRow[]);

  let liveP: Promise<{
    funnel: Awaited<ReturnType<typeof fetchLeadFunnel>>;
    booked: Map<string, { exGst: number; gst: number; converts: number }>;
    realised: Map<string, number>;
  } | null> = Promise.resolve(null);
  if (liveMonths.length) {
    const fromDate = `${liveMonths[0]}-01`;
    const lastMonth = liveMonths[liveMonths.length - 1];
    const toDate = monthLastDay(lastMonth);
    liveP = Promise.all([
      fetchLeadFunnel({ fromDate, toDate, basis: "event" }),
      bookedRevenueByConvertMonth(admin, istStartIso(fromDate), istEndIso(toDate)),
      realisedRevenueByMonth(admin, fromDate, toDate),
    ]).then(([funnel, booked, realised]) => ({ funnel, booked, realised }));
  }
  const [archive, live] = await Promise.all([archiveP, liveP]);
  const archiveBy = new Map(archive.map((a) => [a.month_key, a]));

  return months.map((month): PnlMonth => {
    if (month < PNL_LIVE_FROM_MONTH) {
      const a = archiveBy.get(month);
      const emptyCounts = Object.fromEntries(PNL_COUNT_LINES.map((l) => [l.key, null])) as Record<PnlCountKey, number | null>;
      if (!a) {
        return {
          month,
          source: "none",
          partial: false,
          ...derive({
            sessions: null, leads: null, counts: emptyCounts, organicSpend: null, inorganicSpend: null,
            totalSpend: null, revenueBooked: null, gstBooked: null, revenueRealised: null,
          }),
        };
      }
      const meta = numOrNull(a.meta_spend);
      const nonMeta = numOrNull(a.non_meta_spend);
      const total = meta == null && nonMeta == null ? null : (meta ?? 0) + (nonMeta ?? 0);
      return {
        month,
        source: "archive",
        partial: a.is_partial,
        archive: { activations: a.activations, note: a.import_note },
        ...derive({
          sessions: numOrNull(a.active_users_total),
          leads: numOrNull(a.leads_total),
          counts: {
            // The sheet has one R1/R2/R3 number — booked vs completed is not known
            r1Booked: numOrNull(a.r1),
            r1Completed: null,
            r2Booked: numOrNull(a.r2),
            r2Completed: null,
            r3Booked: numOrNull(a.r3),
            r3Completed: null,
            offer: numOrNull(a.offered),
            convert: numOrNull(a.converts_total),
          },
          // Every rupee in the sheet bought reach (Meta ads, LinkedIn campaigns,
          // influencers, events) → inorganic. Organic activations in the sheet
          // (Shark Tank, posts, challenges) cost nothing → organic spend 0.
          organicSpend: total == null ? null : 0,
          inorganicSpend: total,
          totalSpend: total,
          revenueBooked: null,
          gstBooked: null,
          revenueRealised: null,
        }),
      };
    }

    const rows = (live?.funnel ?? []).filter((r) => r.date.startsWith(month));
    const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((n, r) => n + f(r), 0);
    const counts = Object.fromEntries(
      PNL_COUNT_LINES.map((l) => [l.key, sum((r) => r.funnel[l.key].total)])
    ) as Record<PnlCountKey, number | null>;
    const booked = live?.booked.get(month);
    return {
      month,
      source: "live",
      partial: false,
      ...derive({
        sessions: sum((r) => r.sessions),
        leads: sum((r) => r.leads),
        counts,
        organicSpend: sum((r) => r.organicSpend),
        inorganicSpend: sum((r) => r.inorganicSpend),
        totalSpend: sum((r) => r.totalSpend),
        revenueBooked: booked?.exGst ?? 0,
        gstBooked: booked?.gst ?? 0,
        revenueRealised: live?.realised.get(month) ?? 0,
      }),
    };
  });
}

export const fetchMarketingPnl = cachedMarketingQuery(
  {
    keyPrefix: "marketing-pnl-monthly-v1",
    tags: [MARKETING_CACHE_TAGS.funnel],
    serializeArgs: (fromMonth: string, toMonth: string) => `${fromMonth}|${toMonth}`,
  },
  fetchMarketingPnlUncached
);
