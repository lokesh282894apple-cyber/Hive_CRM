"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

export type FilterOption = { id: string; label: string };

type Values = {
  mode?: string;
  course: string;
  cohort: string;
  counselor?: string;
  panelist?: string;
  round?: string;
};

/**
 * Secondary analytics filters. Course/cohort are controlled from URL-derived
 * props so they update when the top DateRangeBar changes selection.
 */
export function SyncedAnalyticsFilters({
  action,
  stype,
  values,
  courseOptions,
  cohortOptions,
  counselorOptions,
  panelistOptions,
  className,
  children,
}: {
  action: string;
  stype: "year" | "cohort";
  values: Values;
  courseOptions: FilterOption[];
  cohortOptions: FilterOption[];
  counselorOptions?: FilterOption[];
  panelistOptions?: FilterOption[];
  className?: string;
  /** Hidden inputs for date-range / attribution params. */
  children?: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const syncKey = [
    values.course,
    values.cohort,
    values.mode ?? "",
    values.counselor ?? "",
    values.panelist ?? "",
    values.round ?? "",
  ].join("|");

  const [local, setLocal] = useState({ ...values, syncKey });
  if (local.syncKey !== syncKey) {
    setLocal({ ...values, syncKey });
  }

  function pushForm(form: HTMLFormElement) {
    const fd = new FormData(form);
    const q = new URLSearchParams();
    for (const [k, v] of Array.from(fd.entries())) {
      const s = String(v ?? "").trim();
      if (s) q.set(k, s);
    }
    if (local.course) q.set("course", local.course);
    else q.delete("course");
    if (local.cohort) q.set("cohort", local.cohort);
    else q.delete("cohort");
    if (stype === "cohort") {
      if (local.cohort) q.set("rangeCohort", local.cohort);
      else q.delete("rangeCohort");
    }
    const s = q.toString();
    startTransition(() => {
      router.push(s ? `${action}?${s}` : action);
    });
  }

  return (
    <form
      method="get"
      action={action}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        pushForm(e.currentTarget);
      }}
    >
      <fieldset disabled={pending} className="contents m-0 min-w-0 border-0 p-0">
        {children}

        {values.mode !== undefined ? (
          <label className="min-w-[140px] flex-1 text-xs font-semibold text-muted">
            Funnel mode
            <select
              name="mode"
              value={local.mode ?? "period"}
              onChange={(e) => setLocal((s) => ({ ...s, mode: e.target.value }))}
              className="input-field mt-1 py-2 text-sm font-medium"
            >
              <option value="period">Period activity</option>
              <option value="snapshot">Pipeline snapshot</option>
            </select>
          </label>
        ) : null}

        {panelistOptions ? (
          <div>
            <label className="label-field">Panelist</label>
            <select
              name="panelist"
              value={local.panelist ?? ""}
              onChange={(e) =>
                setLocal((s) => ({ ...s, panelist: e.target.value }))
              }
              className="input-field mt-1"
            >
              <option value="">All panelists</option>
              {panelistOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {values.round !== undefined ? (
          <div>
            <label className="label-field">Round</label>
            <select
              name="round"
              value={local.round ?? "all"}
              onChange={(e) => setLocal((s) => ({ ...s, round: e.target.value }))}
              className="input-field mt-1"
            >
              <option value="all">All rounds</option>
              <option value="R1">R1</option>
              <option value="R2">R2</option>
              <option value="R3">R3</option>
            </select>
          </div>
        ) : null}

        <label className="min-w-[140px] flex-1 text-xs font-semibold text-muted">
          Course
          <select
            name="course"
            value={local.course}
            onChange={(e) =>
              setLocal((s) => ({
                ...s,
                course: e.target.value,
                cohort: "",
              }))
            }
            className="input-field mt-1 py-2 text-sm font-medium"
          >
            <option value="">All courses</option>
            {courseOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-[140px] flex-1 text-xs font-semibold text-muted">
          Cohort
          <select
            name="cohort"
            value={local.cohort}
            onChange={(e) =>
              setLocal((s) => ({ ...s, cohort: e.target.value }))
            }
            className="input-field mt-1 py-2 text-sm font-medium"
          >
            <option value="">All cohorts</option>
            {cohortOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        {counselorOptions ? (
          <label className="min-w-[140px] flex-1 text-xs font-semibold text-muted">
            Counselor
            <select
              name="counselor"
              value={local.counselor ?? ""}
              onChange={(e) =>
                setLocal((s) => ({ ...s, counselor: e.target.value }))
              }
              className="input-field mt-1 py-2 text-sm font-medium"
            >
              <option value="">All counselors</option>
              {counselorOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <button type="submit" className="btn-primary text-xs">
          Apply
        </button>
      </fieldset>
    </form>
  );
}
