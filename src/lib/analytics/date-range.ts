/** Calendar YYYY-MM-DD helpers for analytics filters (local browser/server calendar). */

export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function parseDateKey(raw?: string | null): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const t = Date.parse(`${raw}T12:00:00`);
  if (Number.isNaN(t)) return null;
  return raw;
}

export function addDaysKey(dateKey: string, delta: number): string {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return todayKey(d);
}

export function daysBetweenInclusive(fromDate: string, toDate: string): number {
  const a = new Date(`${fromDate}T12:00:00`).getTime();
  const b = new Date(`${toDate}T12:00:00`).getTime();
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

export type ResolvedDateRange = {
  fromDate: string;
  toDate: string;
  rangeDays: number;
  /** Inclusive start as ISO timestamptz */
  sinceIso: string;
  /** Exclusive end as ISO timestamptz (day after toDate at 00:00 local) */
  untilExclusiveIso: string;
};

/**
 * Resolve analytics window from explicit from/to dates and/or a rolling rangeDays preset.
 * Prefer from+to when present; otherwise last `rangeDays` ending today (inclusive).
 */
export function resolveAnalyticsRange(opts?: {
  from?: string | null;
  to?: string | null;
  rangeDays?: number;
}): ResolvedDateRange {
  const today = todayKey();
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
  // Cap to 366 days to keep charts/queries sane
  if (daysBetweenInclusive(fromDate, toDate) > 366) {
    fromDate = addDaysKey(toDate, -365);
  }

  const since = new Date(`${fromDate}T00:00:00`);
  const until = new Date(`${addDaysKey(toDate, 1)}T00:00:00`);

  return {
    fromDate,
    toDate,
    rangeDays: daysBetweenInclusive(fromDate, toDate),
    sinceIso: since.toISOString(),
    untilExclusiveIso: until.toISOString(),
  };
}
