/**
 * Calendar YYYY-MM-DD helpers for analytics filters.
 * All calendars are India time (see lib/tz) — the server runs in UTC, so the
 * old local-calendar version made "today" and every midnight 5h30 early.
 */
import {
  addDays,
  istDateKey,
  istMonthKey,
  istParts,
  istStartIso,
  monthLastDay,
} from "@/lib/tz";

export function todayKey(d: Date = new Date()): string {
  return istDateKey(d);
}

export function parseDateKey(raw?: string | null): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const t = Date.parse(`${raw}T12:00:00`);
  if (Number.isNaN(t)) return null;
  return raw;
}

export function addDaysKey(dateKey: string, delta: number): string {
  return addDays(dateKey, delta);
}

export function daysBetweenInclusive(fromDate: string, toDate: string): number {
  // Pure calendar difference (both keys treated as UTC dates)
  const a = Date.parse(`${fromDate}T00:00:00.000Z`);
  const b = Date.parse(`${toDate}T00:00:00.000Z`);
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

export function eachDateKey(fromDate: string, toDate: string): string[] {
  const out: string[] = [];
  let cur = fromDate;
  for (let i = 0; i < 400; i++) {
    out.push(cur);
    if (cur >= toDate) break;
    cur = addDaysKey(cur, 1);
  }
  return out;
}

export function monthKey(d: Date = new Date()): string {
  return istMonthKey(d);
}

export function parseMonthKey(raw?: string | null): string | null {
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) return null;
  return raw;
}

export function monthBounds(month: string): { from: string; to: string } {
  const [ys, ms] = month.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const mk = `${y}-${String(m).padStart(2, "0")}`;
  return { from: `${mk}-01`, to: monthLastDay(mk) };
}

export function yearBounds(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/** Indian financial year Apr–Mar. fyStartYear = calendar year of April (e.g. 2025 → FY25-26). */
export function financialYearBounds(fyStartYear: number): { from: string; to: string } {
  return {
    from: `${fyStartYear}-04-01`,
    to: `${fyStartYear + 1}-03-31`,
  };
}

export function currentFyStartYear(d: Date = new Date()): number {
  const { year: y, month: m } = istParts(d);
  return m >= 4 ? y : y - 1;
}

export const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export type ResolvedDateRange = {
  fromDate: string;
  toDate: string;
  rangeDays: number;
  /** Inclusive start as ISO timestamptz */
  sinceIso: string;
  /** Exclusive end as ISO timestamptz (day after toDate at 00:00 local) */
  untilExclusiveIso: string;
  overall: boolean;
  selectionType: "year" | "cohort";
  year: number;
  rangeCohortId: string | null;
  month: string | "entire" | null;
};

export type DateRangeSearch = {
  stype?: string | null;
  /** Legacy alias some URLs used instead of stype */
  type?: string | null;
  year?: string | null;
  rangeCohort?: string | null;
  /** Data-filter cohort; used as rangeCohort fallback in cohort date mode */
  cohort?: string | null;
  month?: string | null;
  from?: string | null;
  to?: string | null;
  overall?: string | null;
  range?: string | null;
};

function isoWindow(fromDate: string, toDate: string) {
  // IST midnight of fromDate → IST midnight after toDate
  return {
    sinceIso: istStartIso(fromDate),
    untilExclusiveIso: istStartIso(addDaysKey(toDate, 1)),
  };
}

/**
 * Resolve analytics window from explicit from/to dates and/or a rolling rangeDays preset.
 * Prefer from+to when present; otherwise last `rangeDays` ending today (inclusive).
 */
export function resolveAnalyticsRange(opts?: {
  from?: string | null;
  to?: string | null;
  rangeDays?: number;
  overall?: boolean;
}): ResolvedDateRange {
  const today = todayKey();
  if (opts?.overall) {
    const fromDate = "2020-01-01";
    const toDate = today;
    return {
      fromDate,
      toDate,
      rangeDays: daysBetweenInclusive(fromDate, toDate),
      ...isoWindow(fromDate, toDate),
      overall: true,
      selectionType: "year",
      year: istParts().year,
      rangeCohortId: null,
      month: "entire",
    };
  }
  let toDate = parseDateKey(opts?.to) ?? today;
  let fromDate = parseDateKey(opts?.from);
  if (!fromDate) {
    const days = opts?.rangeDays && opts.rangeDays > 0 ? opts.rangeDays : 30;
    fromDate = addDaysKey(toDate, -(days - 1));
  }
  if (fromDate > toDate) {
    const tmp = fromDate;
    fromDate = toDate;
    toDate = tmp;
  }

  return {
    fromDate,
    toDate,
    rangeDays: daysBetweenInclusive(fromDate, toDate),
    ...isoWindow(fromDate, toDate),
    overall: false,
    selectionType: "year",
    year: Number(fromDate.slice(0, 4)),
    rangeCohortId: null,
    month: fromDate.slice(0, 7),
  };
}

export type CohortRangeInput = {
  id: string;
  year?: number | null;
  start_date?: string | null;
};

export function resolveStructuredRange(opts: {
  search: DateRangeSearch;
  cohorts?: CohortRangeInput[];
}): ResolvedDateRange {
  const search = opts.search;
  if (search.overall === "1" || search.overall === "true") {
    return resolveAnalyticsRange({ overall: true });
  }

  const selectionType: "year" | "cohort" =
    search.stype === "cohort" || search.type === "cohort" ? "cohort" : "year";
  const currentYear = istParts().year;
  const currentMonth = monthKey();

  let year = Number(search.year);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) year = currentYear;

  const rangeCohortId =
    search.rangeCohort ||
    (selectionType === "cohort" ? search.cohort : null) ||
    null;
  const cohort = rangeCohortId
    ? opts.cohorts?.find((c) => c.id === rangeCohortId)
    : null;
  if (selectionType === "cohort" && cohort?.year) {
    year = cohort.year;
  } else if (selectionType === "cohort" && cohort?.start_date) {
    year = Number(cohort.start_date.slice(0, 4)) || year;
  }

  const monthParam =
    search.month === "entire" ? "entire" : parseMonthKey(search.month);
  const { from: yearFrom, to: yearTo } = yearBounds(year);

  let fromDate: string;
  let toDate: string;
  let month: string | "entire" | null = monthParam;

  const manualFrom = parseDateKey(search.from);
  const manualTo = parseDateKey(search.to);

  if (monthParam === "entire") {
    fromDate = yearFrom;
    toDate = yearTo > todayKey() ? todayKey() : yearTo;
    month = "entire";
  } else if (monthParam) {
    const b = monthBounds(monthParam);
    fromDate = b.from;
    toDate = b.to;
    year = Number(monthParam.slice(0, 4));
  } else if (manualFrom || manualTo) {
    fromDate = manualFrom ?? addDaysKey(todayKey(), -29);
    toDate = manualTo ?? todayKey();
    month = fromDate.slice(0, 7);
  } else {
    const b = monthBounds(currentMonth);
    fromDate = b.from;
    toDate = b.to;
    month = currentMonth;
    year = Number(currentMonth.slice(0, 4));
  }

  if (manualFrom) fromDate = manualFrom;
  if (manualTo) toDate = manualTo;
  if (fromDate > toDate) {
    const tmp = fromDate;
    fromDate = toDate;
    toDate = tmp;
  }

  return {
    fromDate,
    toDate,
    rangeDays: daysBetweenInclusive(fromDate, toDate),
    ...isoWindow(fromDate, toDate),
    overall: false,
    selectionType,
    year,
    rangeCohortId: selectionType === "cohort" ? rangeCohortId : null,
    month,
  };
}

export function dateRangeQueryBase(
  range: ResolvedDateRange
): Record<string, string | undefined> {
  return {
    stype: range.selectionType,
    year: String(range.year),
    rangeCohort: range.rangeCohortId ?? undefined,
    month: range.month === "entire" ? "entire" : range.month ?? undefined,
    from: range.fromDate,
    to: range.toDate,
    overall: range.overall ? "1" : undefined,
  };
}
