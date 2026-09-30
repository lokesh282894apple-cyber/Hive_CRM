/**
 * Business calendar = India (Asia/Kolkata, UTC+05:30, no daylight saving).
 *
 * Every "today", day bucket, month bucket and date-range boundary in the CRM
 * must go through these helpers. The server runs in UTC, so using
 * toISOString().slice(0, 10), setHours(0,0,0,0) or `${day}T00:00:00Z` puts
 * leads created 00:00–05:30 IST on the previous day and makes pages disagree.
 */

export const BUSINESS_TZ = "Asia/Kolkata";
export const IST_OFFSET = "+05:30";
const IST_OFFSET_MS = 330 * 60 * 1000;

function shifted(input: Date | string | number): Date {
  const ms = input instanceof Date ? input.getTime() : typeof input === "number" ? input : Date.parse(input);
  return new Date(ms + IST_OFFSET_MS);
}

/**
 * IST calendar date (YYYY-MM-DD) of an instant. Defaults to now.
 * A bare date ("2026-09-28") maps to itself. Unparseable input falls back to
 * its first 10 characters (old behaviour) instead of throwing.
 */
export function istDateKey(at: Date | string | number = new Date()): string {
  const d = shifted(at);
  return Number.isNaN(d.getTime()) ? String(at).slice(0, 10) : d.toISOString().slice(0, 10);
}

/** IST calendar month (YYYY-MM) of an instant. Defaults to now. */
export function istMonthKey(at: Date | string | number = new Date()): string {
  const d = shifted(at);
  return Number.isNaN(d.getTime()) ? String(at).slice(0, 7) : d.toISOString().slice(0, 7);
}

/** IST calendar parts of an instant (month is 1–12). */
export function istParts(at: Date | string | number = new Date()) {
  const d = shifted(at);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Instant of 00:00:00.000 IST on `dayKey`, as a UTC ISO string. */
export function istStartIso(dayKey: string): string {
  return new Date(`${dayKey}T00:00:00.000${IST_OFFSET}`).toISOString();
}

/** Instant of 23:59:59.999 IST on `dayKey`, as a UTC ISO string. */
export function istEndIso(dayKey: string): string {
  return new Date(`${dayKey}T23:59:59.999${IST_OFFSET}`).toISOString();
}

/** 00:00 IST today (or on the IST day of `at`) as a Date. */
export function istMidnight(at: Date | string | number = new Date()): Date {
  return new Date(istStartIso(istDateKey(at)));
}

/** Add whole days to a YYYY-MM-DD key (pure calendar math, TZ-independent). */
export function addDays(dayKey: string, delta: number): string {
  const d = new Date(`${dayKey}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Last day of an IST month key (YYYY-MM) as YYYY-MM-DD. */
export function monthLastDay(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${monthKey}-${String(last).padStart(2, "0")}`;
}

const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * An IST wall-clock value ("YYYY-MM-DDTHH:mm[:ss]", e.g. from
 * <input type="datetime-local"> or a slot's date + start_time) → UTC ISO.
 * Strings that already carry an offset are respected as-is.
 * Without this, the UTC server (or Postgres) reads 15:00 as 15:00 UTC = 20:30 IST.
 */
export function istWallToIso(local: string): string {
  const v = local.trim();
  const d = new Date(HAS_OFFSET.test(v) ? v : `${v.length === 16 ? `${v}:00` : v}${IST_OFFSET}`);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date/time: ${local}`);
  return d.toISOString();
}

/** UTC instant → IST "YYYY-MM-DDTHH:mm" for <input type="datetime-local">. */
export function istLocalInput(at: Date | string | number): string {
  const d = shifted(at);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 16);
}

/** UTC instant → IST "HH:mm". */
export function istTime(at: Date | string | number): string {
  const d = shifted(at);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(11, 16);
}
