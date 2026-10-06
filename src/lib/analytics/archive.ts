/**
 * Sheet archive — the team's Google Sheets, imported as-is into archive_*
 * (migrations 20261006100000 / …01). Months up to ARCHIVE_UNTIL_MONTH come from
 * here; from LIVE_FROM_MONTH the CRM's own data is used.
 *
 * Where tabs disagree, every version is stored; SOURCE below picks the one a
 * dashboard shows and is the single place to change that choice.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/supabase/paginate";
import { monthLastDay } from "@/lib/tz";

/** Last month shown from the sheets; CRM data is trusted from the month after. */
export const ARCHIVE_UNTIL_MONTH = "2026-09";
export const LIVE_FROM_MONTH = "2026-10";

export const ARCHIVE_SHEETS = {
  admissions: "https://docs.google.com/spreadsheets/d/1_mmwpl4sqwU2Cte7tk9Lq_qmgRMIjBkJY-s9OyeParc",
  marketing: "https://docs.google.com/spreadsheets/d/1b2uDKfAAG2MdoaexGHIsGZdEquzW2I5p1mP7L56-9hs",
};

export type ArchiveRow = { tab: string; month_key: string; segment: string; metric: string; value: number | null };
export type ArchiveDailyRow = { tab: string; day: string; scope: string; metric: string; value: number | null };

/** Which tab / metric each archived number is read from, first match wins. */
const SOURCE: Record<string, [tab: string, metric: string][]> = {
  sessions: [["Waterfall Funnel - Outputs", "active_users_total"]],
  sessionsPaid: [["Waterfall Funnel - Outputs", "active_users_paid"]],
  sessionsOrganic: [["Waterfall Funnel - Outputs", "active_users_organic"]],
  leads: [["Waterfall Funnel - Outputs", "leads_total"], ["2026", "total_leads"]],
  leadsPaid: [["Waterfall Funnel - Outputs", "leads_paid"], ["2026", "inorganic_leads"]],
  leadsOrganic: [["Waterfall Funnel - Outputs", "leads_organic"], ["2026", "organic_leads"]],
  aqlPaid: [["Waterfall Funnel - Outputs", "aql_paid"]],
  aqlOrganic: [["Waterfall Funnel - Outputs", "aql_organic"]],
  r1Booked: [["2026", "r1.on_calendar"]],
  r1Completed: [["2026", "r1.on_calendar_to_conducted"]],
  r1NoShow: [["2026", "r1.on_calendar_to_r1_no_show"]],
  r1Reschedule: [["2026", "r1.on_calendar_to_r1_resch"]],
  r1Moved: [["2026", "r1.r1_conducted_to_r2_moved"]],
  r1Reject: [["2026", "r1.r1_conducted_to_r1_reject"]],
  r2Booked: [["2026", "r2.on_calendar"]],
  r2Completed: [["2026", "r2.on_calendar_to_conducted"]],
  r2NoShow: [["2026", "r2.on_calendar_to_r2_no_show"]],
  r2Reschedule: [["2026", "r2.on_calendar_to_r2_resch"]],
  r2Moved: [["2026", "r2.r2_conducted_to_r3_moved"]],
  r2Reject: [["2026", "r2.r2_conducted_to_r2_reject"]],
  r3Booked: [["2026", "r3.on_calendar"]],
  r3Completed: [["2026", "r3.on_calendar_to_conducted"]],
  r3NoShow: [["2026", "r3.on_calendar_to_r3_no_show"]],
  r3Reschedule: [["2026", "r3.on_calendar_to_r3_resch"]],
  r3Moved: [["2026", "r3.r3_conducted_to_offered"]],
  // (the sheet's own label says r1_reject on the R3 row)
  r3Reject: [["2026", "r3.r3_conducted_to_r1_reject"]],
  offer: [["2026", "offer.total_offered"], ["Waterfall Funnel - Outputs", "offered"]],
  won: [["2026", "offer.closed_won"]],
  lost: [["2026", "offer.closed_lost"]],
  convert: [["PGP C2 P&L", "_converts"], ["PGP C3 P&L", "total_students_convert_in_each_month"], ["Waterfall Funnel - Outputs", "converts_total"]],
  metaSpend: [["PGP C2 P&L", "meta_ad_spends"], ["PGP C3 P&L", "meta_ad_spends"], ["Waterfall Funnel - Outputs", "meta_spend"]],
  totalSpend: [["PGP C2 P&L", "grand_total_expenditure"], ["PGP C3 P&L", "total_inorganic_spends"], ["Waterfall Funnel - Outputs", "_meta_plus_non_meta"]],
  revenueBooked: [["PGP C2 P&L", "revenue_booked"], ["PGP C3 P&L", "revenue_booked"]],
  revenueRealised: [["PGP C2 P&L", "revenue_realised"]],
};
export type ArchiveMetric = keyof typeof SOURCE;

export type ArchiveMonth = {
  month: string;
  values: Partial<Record<ArchiveMetric, number>>;
  /** tab each value came from, for the "source" hint */
  from: Partial<Record<ArchiveMetric, string>>;
};

export async function loadArchiveRows(
  db: SupabaseClient,
  fromMonth: string,
  toMonth: string,
  segment = "all"
): Promise<ArchiveRow[]> {
  return fetchAllPages<ArchiveRow>(
    (from, to) =>
      db
        .from("archive_monthly")
        .select("tab, month_key, segment, metric, value")
        .eq("segment", segment)
        .gte("month_key", fromMonth)
        .lte("month_key", toMonth)
        .order("month_key", { ascending: true })
        .order("metric", { ascending: true })
        .range(from, to),
    "archive_monthly"
  ).catch(() => [] as ArchiveRow[]);
}

export async function loadArchiveDaily(
  db: SupabaseClient,
  fromDay: string,
  toDay: string,
  scopeLike?: string
): Promise<ArchiveDailyRow[]> {
  return fetchAllPages<ArchiveDailyRow>(
    (from, to) => {
      let q = db
        .from("archive_daily")
        .select("tab, day, scope, metric, value")
        .gte("day", fromDay)
        .lte("day", toDay);
      if (scopeLike) q = q.like("scope", scopeLike);
      return q.order("day", { ascending: true }).order("scope", { ascending: true }).order("metric", { ascending: true }).range(from, to);
    },
    "archive_daily"
  ).catch(() => [] as ArchiveDailyRow[]);
}

/**
 * One value per metric per month, using SOURCE. Months the monthly funnel tab
 * doesn't cover (Aug / Sep 2026) take interview counts from the day-by-day log.
 */
export function resolveArchiveMonths(rows: ArchiveRow[], daily: ArchiveDailyRow[], months: string[]): ArchiveMonth[] {
  const byKey = new Map<string, number>();
  for (const r of rows) if (r.value != null) byKey.set(`${r.tab}|${r.month_key}|${r.metric}`, Number(r.value));
  // Derived: PGP + Launchpad converts in the C2 P&L; Meta + non-Meta spend in Waterfall
  for (const m of months) {
    const pgp = byKey.get(`PGP C2 P&L|${m}|pgp`);
    const lp = byKey.get(`PGP C2 P&L|${m}|launchpad`);
    if (pgp != null || lp != null) byKey.set(`PGP C2 P&L|${m}|_converts`, (pgp ?? 0) + (lp ?? 0));
    const meta = byKey.get(`Waterfall Funnel - Outputs|${m}|meta_spend`);
    const nonMeta = byKey.get(`Waterfall Funnel - Outputs|${m}|non_meta_spend`);
    if (meta != null || nonMeta != null) byKey.set(`Waterfall Funnel - Outputs|${m}|_meta_plus_non_meta`, (meta ?? 0) + (nonMeta ?? 0));
  }
  // Day-by-day interview log → monthly, for months without the monthly tab
  const dailySum = new Map<string, number>();
  for (const d of daily) {
    if (d.value == null) continue;
    const k = `${d.day.slice(0, 7)}|${d.scope}|${d.metric}`;
    dailySum.set(k, (dailySum.get(k) ?? 0) + Number(d.value));
  }
  const fromDaily: Partial<Record<ArchiveMetric, [string, string]>> = {
    r1Booked: ["R1", "on_calendar"],
    r1Completed: ["R1", "conducted"],
    r1NoShow: ["R1", "no_show"],
    r1Reschedule: ["R1", "rescheduled"],
    r1Moved: ["R1", "moved_to_next"],
    r1Reject: ["R1", "rejected"],
    r2Booked: ["R2", "on_calendar"],
    r2Completed: ["R2", "conducted"],
    r2NoShow: ["R2", "no_show"],
    r2Reschedule: ["R2", "rescheduled"],
    r2Moved: ["R2", "moved_to_next"],
    r2Reject: ["R2", "rejected"],
    r3Booked: ["R3", "on_calendar"],
    r3Completed: ["R3", "conducted"],
    r3NoShow: ["R3", "no_show"],
    r3Reschedule: ["R3", "rescheduled"],
    r3Moved: ["R3", "offered"],
    r3Reject: ["R3", "rejected"],
    offer: ["R3", "offered"],
  };

  return months.map((month) => {
    const values: ArchiveMonth["values"] = {};
    const from: ArchiveMonth["from"] = {};
    for (const metric of Object.keys(SOURCE) as ArchiveMetric[]) {
      for (const [tab, key] of SOURCE[metric]) {
        const v = byKey.get(`${tab}|${month}|${key}`);
        if (v != null) {
          values[metric] = v;
          from[metric] = tab;
          break;
        }
      }
      const d = fromDaily[metric];
      if (values[metric] == null && d) {
        const v = dailySum.get(`${month}|${d[0]}|${d[1]}`);
        if (v != null) {
          values[metric] = v;
          from[metric] = "Day-by-day log";
        }
      }
    }
    return { month, values, from };
  });
}

export async function fetchArchiveMonths(db: SupabaseClient, months: string[]): Promise<ArchiveMonth[]> {
  const inArchive = months.filter((m) => m <= ARCHIVE_UNTIL_MONTH);
  if (!inArchive.length) return [];
  const first = inArchive[0];
  const last = inArchive[inArchive.length - 1];
  const [rows, daily] = await Promise.all([
    loadArchiveRows(db, first, last),
    loadArchiveDaily(db, `${first}-01`, monthLastDay(last), "R%"),
  ]);
  return resolveArchiveMonths(rows, daily, inArchive);
}
