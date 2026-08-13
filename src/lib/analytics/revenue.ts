import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkArray, mapPool } from "@/lib/async-pool";
import { admissionsAggClient } from "@/lib/analytics/agg-client";
import { cohortNumberMap } from "@/lib/cohorts/display";
import {
  addDaysKey,
  resolveAnalyticsRange,
  todayKey,
} from "@/lib/analytics/date-range";
import { fetchAllPages } from "@/lib/supabase/paginate";

const MARKETING_TZ = "Asia/Kolkata";

export type RevenueFilters = {
  courseId?: string | null;
  cohortId?: string | null;
  /** Inclusive YYYY-MM-DD */
  fromDate?: string | null;
  /** Inclusive YYYY-MM-DD */
  toDate?: string | null;
  /** Legacy YYYY-MM — used only if fromDate/toDate absent */
  fromMonth?: string | null;
  /** Legacy YYYY-MM — used only if fromDate/toDate absent */
  toMonth?: string | null;
};

export type RevenueKpis = {
  booked: number;
  realised: number;
  outstanding: number;
  realisationPct: number;
  feeBooks: number;
  admissionFeePaid: number;
  completePayers: number;
  partialPayers: number;
};

export type MonthRevenue = {
  month: string;
  booked: number;
  realised: number;
};

export type CohortRevenue = {
  cohortId: string | null;
  label: string;
  courseName: string | null;
  booked: number;
  realised: number;
  outstanding: number;
  complete: number;
  feeBooks: number;
};

export type PayerRow = {
  leadId: string;
  leadName: string;
  cohortLabel: string;
  booked: number;
  realised: number;
  outstanding: number;
  complete: boolean;
  admissionFeePaid: boolean;
  paymentMode: string;
};

export type RevenueReport = {
  kpis: RevenueKpis;
  monthly: MonthRevenue[];
  byCohort: CohortRevenue[];
  payers: PayerRow[];
  filters: {
    fromDate: string;
    toDate: string;
    fromMonth: string;
    toMonth: string;
    courseId: string | null;
    cohortId: string | null;
  };
};

function dayKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-CA", { timeZone: MARKETING_TZ });
}

function monthKeyFromDay(day: string | null | undefined): string | null {
  if (!day || day.length < 7) return null;
  return day.slice(0, 7);
}

function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  for (let i = 0; i < 48; i++) {
    out.push(cur);
    if (cur === to) break;
    cur = addMonths(cur, 1);
    if (cur > to) break;
  }
  return out;
}

function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 0);
  return `${y}-${String(m).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function resolveRevenueWindow(filters: RevenueFilters): {
  fromDate: string;
  toDate: string;
} {
  if (filters.fromDate || filters.toDate) {
    const r = resolveAnalyticsRange({
      from: filters.fromDate,
      to: filters.toDate,
      rangeDays: 30,
    });
    return { fromDate: r.fromDate, toDate: r.toDate };
  }
  if (filters.fromMonth || filters.toMonth) {
    const toMonth = filters.toMonth || todayKey().slice(0, 7);
    const fromMonth = filters.fromMonth || addMonths(toMonth, -11);
    return {
      fromDate: `${fromMonth}-01`,
      toDate: lastDayOfMonth(toMonth),
    };
  }
  // Default: last 12 months ending today
  const to = todayKey();
  return { fromDate: addDaysKey(to, -364), toDate: to };
}

function n(v: unknown) {
  return Number(v) || 0;
}

function inWindow(day: string | null, fromDate: string, toDate: string) {
  return Boolean(day && day >= fromDate && day <= toDate);
}

export async function fetchRevenueReport(
  supabase: SupabaseClient,
  filters: RevenueFilters = {}
): Promise<RevenueReport> {
  const { fromDate, toDate } = resolveRevenueWindow(filters);
  const fromMonth = fromDate.slice(0, 7);
  const toMonth = toDate.slice(0, 7);
  const courseId = filters.courseId || null;
  const cohortId = filters.cohortId || null;
  const db = admissionsAggClient(supabase);

  const [feeRows, courses, cohorts] = await Promise.all([
    fetchAllPages(
      (from, to) =>
        db
          .from("fee_records")
          .select(
            "id, lead_id, total_fee, remaining_fee, payment_mode, fee_set_at, created_at, updated_at"
          )
          .gt("total_fee", 0)
          .order("created_at", { ascending: false })
          .range(from, to),
      "fee_records"
    ).catch(async (err: Error) => {
      if (!/fee_set_at/i.test(err.message)) throw err;
      return fetchAllPages(
        (from, to) =>
          db
            .from("fee_records")
            .select(
              "id, lead_id, total_fee, remaining_fee, payment_mode, created_at, updated_at"
            )
            .gt("total_fee", 0)
            .order("created_at", { ascending: false })
            .range(from, to),
        "fee_records"
      );
    }),
    db.from("courses").select("id, name"),
    db.from("cohorts").select("id, name, course_id, start_date"),
  ]);

  const feeIds = feeRows.map((f) => f.id);
  const leadIds = Array.from(new Set(feeRows.map((f) => f.lead_id)));
  const leadChunks = chunkArray(leadIds, 200);
  const feeChunks = chunkArray(feeIds, 200);

  const [leadParts, installmentParts, loanParts] = await Promise.all([
    mapPool(leadChunks, 6, async (chunk) => {
      const { data } = await db
        .from("leads")
        .select("id, name, course_id, cohort_id")
        .in("id", chunk);
      return (data ?? []) as {
        id: string;
        name: string;
        course_id: string | null;
        cohort_id: string | null;
      }[];
    }),
    mapPool(feeChunks, 6, async (chunk) => {
      let { data, error } = await db
        .from("installments")
        .select("fee_record_id, installment_number, amount_realised, paid_at")
        .in("fee_record_id", chunk);
      if (error && /paid_at/i.test(error.message)) {
        const fallback = await db
          .from("installments")
          .select("fee_record_id, installment_number, amount_realised")
          .in("fee_record_id", chunk);
        data = (fallback.data ?? []).map((r) => ({ ...r, paid_at: null }));
        error = fallback.error;
      }
      if (error) throw new Error(`installments: ${error.message}`);
      return (data ?? []) as {
        fee_record_id: string;
        installment_number: number;
        amount_realised: number;
        paid_at: string | null;
      }[];
    }),
    mapPool(feeChunks, 6, async (chunk) => {
      const { data } = await db
        .from("loans")
        .select("fee_record_id, amount_realised, updated_at")
        .in("fee_record_id", chunk);
      return (data ?? []) as {
        fee_record_id: string;
        amount_realised: number;
        updated_at: string;
      }[];
    }),
  ]);

  const leads = leadParts.flat();
  const installments = installmentParts.flat();
  const loans = loanParts.flat();

  const leadMap = new Map(leads.map((l) => [l.id, l]));
  const courseMap = new Map((courses.data ?? []).map((c) => [c.id, c.name]));
  const cohortList = cohorts.data ?? [];
  const cohortNums = cohortNumberMap(cohortList);
  const cohortMap = new Map(cohortList.map((c) => [c.id, c]));

  const instByFee = new Map<string, typeof installments>();
  for (const inst of installments) {
    const list = instByFee.get(inst.fee_record_id) ?? [];
    list.push(inst);
    instByFee.set(inst.fee_record_id, list);
  }
  const loanByFee = new Map(loans.map((l) => [l.fee_record_id, l]));

  type Book = {
    feeId: string;
    leadId: string;
    leadName: string;
    courseId: string | null;
    cohortId: string | null;
    booked: number;
    realised: number;
    outstanding: number;
    paymentMode: string;
    bookedAt: string | null;
    bookedDay: string | null;
    admissionFeePaid: boolean;
    complete: boolean;
    realisedEvents: { day: string; amount: number }[];
  };

  const books: Book[] = [];

  for (const fee of feeRows) {
    const lead = leadMap.get(fee.lead_id);
    if (!lead) continue;
    if (courseId && lead.course_id !== courseId) continue;
    if (cohortId && lead.cohort_id !== cohortId) continue;

    const booked = n(fee.total_fee);
    if (booked <= 0) continue;
    const outstanding = n(fee.remaining_fee);
    const realised = Math.max(0, booked - outstanding);
    const bookedAt =
      (fee as { fee_set_at?: string | null }).fee_set_at || fee.created_at;
    const bookedDay = dayKey(bookedAt);

    const insts = (instByFee.get(fee.id) ?? [])
      .slice()
      .sort((a, b) => a.installment_number - b.installment_number);
    const loan = loanByFee.get(fee.id);
    const admissionFeePaid =
      insts.some((i) => n(i.amount_realised) > 0) || n(loan?.amount_realised) > 0;

    const realisedEvents: { day: string; amount: number }[] = [];
    if (fee.payment_mode === "loan" && loan && n(loan.amount_realised) > 0) {
      const dk = dayKey(loan.updated_at) || bookedDay;
      if (dk) realisedEvents.push({ day: dk, amount: n(loan.amount_realised) });
    } else {
      for (const inst of insts) {
        const amt = n(inst.amount_realised);
        if (amt <= 0) continue;
        const dk =
          dayKey(inst.paid_at) || dayKey(fee.updated_at) || bookedDay;
        if (dk) realisedEvents.push({ day: dk, amount: amt });
      }
      if (realised > 0 && realisedEvents.length === 0) {
        const dk = dayKey(fee.updated_at) || bookedDay;
        if (dk) realisedEvents.push({ day: dk, amount: realised });
      }
    }

    books.push({
      feeId: fee.id,
      leadId: lead.id,
      leadName: lead.name,
      courseId: lead.course_id,
      cohortId: lead.cohort_id,
      booked,
      realised,
      outstanding,
      paymentMode: fee.payment_mode,
      bookedAt,
      bookedDay,
      admissionFeePaid,
      complete: outstanding === 0 && booked > 0,
      realisedEvents,
    });
  }

  const monthKeys = monthsBetween(fromMonth, toMonth);
  const monthlyMap = new Map<string, MonthRevenue>(
    monthKeys.map((m) => [m, { month: m, booked: 0, realised: 0 }])
  );

  let booked = 0;
  let realised = 0;
  let outstanding = 0;
  let admissionFeePaid = 0;
  let completePayers = 0;
  let partialPayers = 0;
  let feeBooksInPeriod = 0;

  const cohortAgg = new Map<string, CohortRevenue>();
  const periodBooks: Book[] = [];

  for (const b of books) {
    const bookedInPeriod = inWindow(b.bookedDay, fromDate, toDate);
    const realisedInPeriod = b.realisedEvents
      .filter((ev) => inWindow(ev.day, fromDate, toDate))
      .reduce((s, ev) => s + ev.amount, 0);
    const touchesPeriod = bookedInPeriod || realisedInPeriod > 0;
    if (!touchesPeriod) continue;

    periodBooks.push(b);
    feeBooksInPeriod += 1;

    if (bookedInPeriod) {
      booked += b.booked;
      outstanding += b.outstanding;
      if (b.admissionFeePaid) admissionFeePaid += 1;
      if (b.complete) completePayers += 1;
      else if (b.realised > 0) partialPayers += 1;
    }
    realised += realisedInPeriod;

    const bm = monthKeyFromDay(b.bookedDay);
    if (bookedInPeriod && bm && monthlyMap.has(bm)) {
      monthlyMap.get(bm)!.booked += b.booked;
    }
    for (const ev of b.realisedEvents) {
      if (!inWindow(ev.day, fromDate, toDate)) continue;
      const mk = monthKeyFromDay(ev.day);
      if (mk && monthlyMap.has(mk)) monthlyMap.get(mk)!.realised += ev.amount;
    }

    const key = b.cohortId ?? "__none__";
    const cohort = b.cohortId ? cohortMap.get(b.cohortId) : null;
    const courseName = b.courseId ? courseMap.get(b.courseId) ?? null : null;
    const label = cohort
      ? `${courseName ?? "Course"} · ${cohortNums.get(cohort.id) ?? cohort.name}`
      : "Unassigned cohort";
    const agg = cohortAgg.get(key) ?? {
      cohortId: b.cohortId,
      label,
      courseName,
      booked: 0,
      realised: 0,
      outstanding: 0,
      complete: 0,
      feeBooks: 0,
    };
    if (bookedInPeriod) {
      agg.booked += b.booked;
      agg.outstanding += b.outstanding;
      agg.feeBooks += 1;
      if (b.complete) agg.complete += 1;
    }
    agg.realised += realisedInPeriod;
    cohortAgg.set(key, agg);
  }

  const payers: PayerRow[] = periodBooks
    .map((b) => {
      const cohort = b.cohortId ? cohortMap.get(b.cohortId) : null;
      const courseName = b.courseId ? courseMap.get(b.courseId) ?? null : null;
      return {
        leadId: b.leadId,
        leadName: b.leadName,
        cohortLabel: cohort
          ? `${courseName ?? "Course"} · ${cohortNums.get(cohort.id) ?? cohort.name}`
          : "—",
        booked: b.booked,
        realised: b.realised,
        outstanding: b.outstanding,
        complete: b.complete,
        admissionFeePaid: b.admissionFeePaid,
        paymentMode: b.paymentMode,
      };
    })
    .sort((a, b) => b.outstanding - a.outstanding || b.booked - a.booked);

  return {
    kpis: {
      booked,
      realised,
      outstanding,
      realisationPct: booked > 0 ? (realised / booked) * 100 : 0,
      feeBooks: feeBooksInPeriod,
      admissionFeePaid,
      completePayers,
      partialPayers,
    },
    monthly: Array.from(monthlyMap.values()),
    byCohort: Array.from(cohortAgg.values()).sort((a, b) => b.booked - a.booked),
    payers,
    filters: { fromDate, toDate, fromMonth, toMonth, courseId, cohortId },
  };
}
