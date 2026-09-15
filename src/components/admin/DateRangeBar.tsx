"use client";

import {
  MONTH_SHORT,
  dateRangeQueryBase,
  monthBounds,
  monthKey,
  type ResolvedDateRange,
} from "@/lib/analytics/date-range";
import { cn, formatDate } from "@/lib/utils";
import { CalendarDays } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export type DateRangeCohortOption = {
  id: string;
  label: string;
  year: number | null;
  courseId?: string | null;
};

function prettyDate(iso: string) {
  return formatDate(`${iso}T12:00:00`);
}

function rangeSummary(range: ResolvedDateRange) {
  if (range.overall) return "All time";
  if (range.month === "entire") {
    return range.selectionType === "cohort"
      ? `Entire cohort · ${range.year}`
      : `Jan – Dec ${range.year}`;
  }
  const from = prettyDate(range.fromDate);
  const to = prettyDate(range.toDate);
  return from === to ? from : `${from} – ${to}`;
}

export function DateRangeBar({
  range,
  years,
  cohorts,
  showOverall = false,
  pathname: pathnameProp,
}: {
  range: ResolvedDateRange;
  years: number[];
  cohorts: DateRangeCohortOption[];
  showOverall?: boolean;
  pathname?: string;
}) {
  const router = useRouter();
  const urlPathname = usePathname();
  const pathname = pathnameProp ?? urlPathname;
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function hrefFor(patch: Record<string, string | undefined>) {
    const q = new URLSearchParams(searchParams.toString());
    // Normalize legacy `type` → `stype`
    if (q.has("type") && !q.has("stype")) {
      q.set("stype", q.get("type") || "");
      q.delete("type");
    }
    const base = dateRangeQueryBase(range);
    const next = { ...base, ...patch };
    for (const [k, v] of Object.entries(next)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    if (patch.overall === "1") {
      q.set("overall", "1");
      q.delete("from");
      q.delete("to");
      q.delete("month");
    } else {
      q.delete("overall");
    }
    q.delete("range");
    q.delete("type");
    const s = q.toString();
    return s ? `${pathname}?${s}` : pathname;
  }

  function go(patch: Record<string, string | undefined>) {
    startTransition(() => {
      router.push(hrefFor(patch));
    });
  }

  function goCohortMode(cohortId?: string) {
    const id = cohortId || range.rangeCohortId || cohorts[0]?.id;
    const c = id ? cohorts.find((x) => x.id === id) : undefined;
    go({
      stype: "cohort",
      rangeCohort: id || undefined,
      // Keep bottom Course/Cohort filters in sync with the top picker
      cohort: id || undefined,
      course: c?.courseId || undefined,
      month: range.month === "entire" ? "entire" : range.month ?? "entire",
      overall: undefined,
    });
  }

  function goYearMode() {
    go({
      stype: "year",
      rangeCohort: undefined,
      overall: undefined,
      month: range.month === "entire" ? "entire" : range.month ?? undefined,
    });
  }

  const yearMonths = MONTH_SHORT.map((label, i) => {
    const key = `${range.year}-${String(i + 1).padStart(2, "0")}`;
    return { key, label };
  });

  const mode: "year" | "cohort" | "overall" = range.overall
    ? "overall"
    : range.selectionType === "cohort"
      ? "cohort"
      : "year";

  const entireActive = !range.overall && range.month === "entire";
  const entireLabel =
    range.selectionType === "cohort" ? "Entire cohort" : "Full year";

  return (
    <section
      className={cn(
        "panel overflow-hidden transition-opacity duration-150",
        pending && "pointer-events-none opacity-60"
      )}
    >
      <div className="flex flex-col gap-4 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy/[0.06] text-navy">
            <CalendarDays className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="eyebrow">Date range</p>
            <p className="mt-0.5 truncate text-base font-semibold tracking-tight text-navy">
              {rangeSummary(range)}
            </p>
            {!range.overall ? (
              <p className="mt-0.5 text-xs text-muted">
                {range.rangeDays} day{range.rangeDays === 1 ? "" : "s"}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-muted">No date cap</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-pill border border-border bg-[#F7F8FC] p-1">
            <button
              type="button"
              className={cn(
                "rounded-pill px-3 py-1.5 text-xs font-semibold uppercase tracking-eyebrow transition",
                mode === "year" ? "bg-navy text-white" : "text-muted hover:text-navy"
              )}
              onClick={goYearMode}
            >
              Year
            </button>
            <button
              type="button"
              className={cn(
                "rounded-pill px-3 py-1.5 text-xs font-semibold uppercase tracking-eyebrow transition",
                mode === "cohort" ? "bg-navy text-white" : "text-muted hover:text-navy"
              )}
              onClick={() => goCohortMode()}
            >
              Cohort
            </button>
            {showOverall ? (
              <button
                type="button"
                className={cn(
                  "rounded-pill px-3 py-1.5 text-xs font-semibold uppercase tracking-eyebrow transition",
                  mode === "overall" ? "bg-navy text-white" : "text-muted hover:text-navy"
                )}
                onClick={() => go({ overall: "1", rangeCohort: undefined })}
              >
                Overall
              </button>
            ) : null}
          </div>

          {mode === "year" ? (
            <label className="sr-only" htmlFor="date-range-year">
              Year
            </label>
          ) : null}
          {mode === "year" ? (
            <select
              id="date-range-year"
              className="h-9 min-w-[96px] rounded-pill border border-border bg-white px-3 text-sm font-semibold text-navy outline-none focus:border-periwinkle focus:ring-2 focus:ring-periwinkle/20"
              value={String(range.year)}
              disabled={pending}
              onChange={(e) => {
                const year = e.target.value;
                const m =
                  range.month === "entire"
                    ? "entire"
                    : `${year}-${(range.month ?? monthKey()).slice(5)}`;
                const bounds = m === "entire" ? null : monthBounds(m);
                go({
                  year,
                  month: m,
                  from: bounds?.from,
                  to: bounds?.to,
                  rangeCohort: undefined,
                  overall: undefined,
                });
              }}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          ) : null}

          {mode === "cohort" ? (
            <select
              aria-label="Cohort for date range"
              className="h-9 min-w-[180px] max-w-[260px] rounded-pill border border-border bg-white px-3 text-sm font-semibold text-navy outline-none focus:border-periwinkle focus:ring-2 focus:ring-periwinkle/20"
              value={range.rangeCohortId ?? ""}
              disabled={pending}
              onChange={(e) => {
                const id = e.target.value;
                if (!id) {
                  go({
                    rangeCohort: undefined,
                    cohort: undefined,
                    overall: undefined,
                  });
                  return;
                }
                const c = cohorts.find((x) => x.id === id);
                go({
                  stype: "cohort",
                  rangeCohort: id,
                  cohort: id,
                  course: c?.courseId || undefined,
                  year: c?.year ? String(c.year) : undefined,
                  month: "entire",
                  overall: undefined,
                });
              }}
            >
              <option value="">Select cohort</option>
              {cohorts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        <div className={cn(range.overall && "pointer-events-none opacity-40")}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="eyebrow">Month</p>
            <button
              type="button"
              className={cn(
                "rounded-pill px-3 py-1 text-xs font-semibold transition",
                entireActive
                  ? "bg-navy text-white"
                  : "text-periwinkle hover:bg-periwinkle/10"
              )}
              onClick={() =>
                go({
                  month: "entire",
                  from: `${range.year}-01-01`,
                  to: `${range.year}-12-31`,
                  overall: undefined,
                })
              }
            >
              {entireLabel}
            </button>
          </div>
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
            {yearMonths.map((m) => {
              const active = !range.overall && range.month === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  aria-pressed={active}
                  className={cn(
                    "rounded-xl px-1 py-2 text-center text-[11px] font-semibold uppercase tracking-wide transition active:scale-[0.97]",
                    active
                      ? "bg-navy text-white shadow-sm"
                      : "bg-[#F7F8FC] text-navy hover:bg-navy/10"
                  )}
                  onClick={() => {
                    const b = monthBounds(m.key);
                    go({
                      month: m.key,
                      from: b.from,
                      to: b.to,
                      year: m.key.slice(0, 4),
                      overall: undefined,
                    });
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <form
          key={`${range.fromDate}-${range.toDate}-${range.overall ? "o" : "d"}`}
          className={cn(
            "flex flex-wrap items-end gap-3 border-t border-border pt-4",
            range.overall && "pointer-events-none opacity-40"
          )}
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            go({
              from: String(fd.get("from") || "") || undefined,
              to: String(fd.get("to") || "") || undefined,
              overall: undefined,
            });
          }}
        >
          <p className="eyebrow w-full sm:w-auto sm:pb-2.5">Narrow dates</p>
          <label className="min-w-[148px] flex-1 text-xs font-medium text-muted">
            From
            <input
              type="date"
              name="from"
              defaultValue={range.fromDate}
              className="input-field mt-1 py-2"
            />
          </label>
          <label className="min-w-[148px] flex-1 text-xs font-medium text-muted">
            To
            <input
              type="date"
              name="to"
              defaultValue={range.toDate}
              className="input-field mt-1 py-2"
            />
          </label>
          <button type="submit" className="btn-primary h-[42px] px-5 text-xs">
            Apply
          </button>
        </form>
      </div>
    </section>
  );
}
