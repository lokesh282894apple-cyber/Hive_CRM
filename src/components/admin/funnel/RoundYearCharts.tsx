"use client";

import { useMemo, useState } from "react";
import {
  HoverLineChart,
  type HoverSeries,
} from "@/components/charts/HoverLineChart";
import { chartColor } from "@/components/charts/SimpleCharts";
import type {
  MonthStripRow,
  RoundKey,
} from "@/lib/analytics/admissions-funnel";
import { cn } from "@/lib/utils";

type SeriesDef = {
  id: string;
  label: string;
  kind: "count" | "rate";
  value: (m: MonthStripRow) => number | null;
};

type ViewMode = "table" | "chart";

function pct(num: number, den: number): number | null {
  if (den <= 0) return null;
  return (num / den) * 100;
}

function fmtCount(n: number | null) {
  if (n == null) return "—";
  return Math.round(n).toLocaleString("en-IN");
}

function fmtPct(n: number | null) {
  if (n == null) return "—";
  return `${n.toFixed(1)}%`;
}

const R1_SERIES: SeriesDef[] = [
  {
    id: "leads",
    label: "Total leads",
    kind: "count",
    value: (m) => m.leadTotals.total,
  },
  {
    id: "r1_booked",
    label: "R1 booked",
    kind: "count",
    value: (m) => m.roundFunnel.R1.onCalendar,
  },
  {
    id: "r1_booked_pct",
    label: "R1 booked :: leads %",
    kind: "rate",
    value: (m) => pct(m.roundFunnel.R1.onCalendar, m.leadTotals.total),
  },
  {
    id: "r1_conducted",
    label: "R1 conducted",
    kind: "count",
    value: (m) => m.roundFunnel.R1.conducted,
  },
  {
    id: "r1_conducted_pct",
    label: "R1 conducted :: booked %",
    kind: "rate",
    value: (m) => pct(m.roundFunnel.R1.conducted, m.roundFunnel.R1.onCalendar),
  },
  {
    id: "r1_no_show",
    label: "R1 no show",
    kind: "count",
    value: (m) => m.roundFunnel.R1.noShow,
  },
  {
    id: "r1_no_show_pct",
    label: "R1 no show :: booked %",
    kind: "rate",
    value: (m) => pct(m.roundFunnel.R1.noShow, m.roundFunnel.R1.onCalendar),
  },
  {
    id: "r1_reschedule",
    label: "R1 reschedule",
    kind: "count",
    value: (m) => m.roundFunnel.R1.reschedule,
  },
  {
    id: "r1_reschedule_pct",
    label: "R1 reschedule :: booked %",
    kind: "rate",
    value: (m) => pct(m.roundFunnel.R1.reschedule, m.roundFunnel.R1.onCalendar),
  },
  {
    id: "r2_booked",
    label: "R2 booked",
    kind: "count",
    value: (m) => m.roundFunnel.R2.onCalendar,
  },
  {
    id: "r2_from_r1_pct",
    label: "R2 booked :: R1 booked %",
    kind: "rate",
    value: (m) =>
      pct(m.roundFunnel.R2.onCalendar, m.roundFunnel.R1.onCalendar),
  },
];

const R2_SERIES: SeriesDef[] = [
  {
    id: "r2_booked",
    label: "R2 booked",
    kind: "count",
    value: (m) => m.roundFunnel.R2.onCalendar,
  },
  {
    id: "r2_conducted",
    label: "R2 conducted",
    kind: "count",
    value: (m) => m.roundFunnel.R2.conducted,
  },
  {
    id: "r2_conducted_pct",
    label: "R2 conducted :: booked %",
    kind: "rate",
    value: (m) => pct(m.roundFunnel.R2.conducted, m.roundFunnel.R2.onCalendar),
  },
  {
    id: "r2_no_show",
    label: "R2 no show",
    kind: "count",
    value: (m) => m.roundFunnel.R2.noShow,
  },
  {
    id: "r2_no_show_pct",
    label: "R2 no show :: booked %",
    kind: "rate",
    value: (m) => pct(m.roundFunnel.R2.noShow, m.roundFunnel.R2.onCalendar),
  },
  {
    id: "r2_reschedule",
    label: "R2 reschedule",
    kind: "count",
    value: (m) => m.roundFunnel.R2.reschedule,
  },
  {
    id: "r2_reschedule_pct",
    label: "R2 reschedule :: booked %",
    kind: "rate",
    value: (m) => pct(m.roundFunnel.R2.reschedule, m.roundFunnel.R2.onCalendar),
  },
  {
    id: "r3_booked",
    label: "R3 booked",
    kind: "count",
    value: (m) => m.roundFunnel.R3.onCalendar,
  },
  {
    id: "r3_from_r2_pct",
    label: "R3 booked :: R2 booked %",
    kind: "rate",
    value: (m) =>
      pct(m.roundFunnel.R3.onCalendar, m.roundFunnel.R2.onCalendar),
  },
];

const R3_SERIES: SeriesDef[] = [
  {
    id: "r3_booked",
    label: "R3 booked",
    kind: "count",
    value: (m) => m.roundFunnel.R3.onCalendar,
  },
  {
    id: "r3_conducted",
    label: "R3 conducted",
    kind: "count",
    value: (m) => m.roundFunnel.R3.conducted,
  },
  {
    id: "r3_conducted_pct",
    label: "R3 conducted :: booked %",
    kind: "rate",
    value: (m) => pct(m.roundFunnel.R3.conducted, m.roundFunnel.R3.onCalendar),
  },
  {
    id: "r3_no_show",
    label: "R3 no show",
    kind: "count",
    value: (m) => m.roundFunnel.R3.noShow,
  },
  {
    id: "r3_no_show_pct",
    label: "R3 no show :: booked %",
    kind: "rate",
    value: (m) => pct(m.roundFunnel.R3.noShow, m.roundFunnel.R3.onCalendar),
  },
  {
    id: "r3_reschedule",
    label: "R3 reschedule",
    kind: "count",
    value: (m) => m.roundFunnel.R3.reschedule,
  },
  {
    id: "r3_reschedule_pct",
    label: "R3 reschedule :: booked %",
    kind: "rate",
    value: (m) => pct(m.roundFunnel.R3.reschedule, m.roundFunnel.R3.onCalendar),
  },
  {
    id: "offered",
    label: "Offered",
    kind: "count",
    value: (m) => m.offerFunnel.offered,
  },
  {
    id: "offered_from_r3_pct",
    label: "Offered :: R3 booked %",
    kind: "rate",
    value: (m) => pct(m.offerFunnel.offered, m.roundFunnel.R3.onCalendar),
  },
];

const SERIES_BY_ROUND: Record<RoundKey, SeriesDef[]> = {
  R1: R1_SERIES,
  R2: R2_SERIES,
  R3: R3_SERIES,
};

function defaultEnabled(defs: SeriesDef[]): Set<string> {
  return new Set(defs.map((d) => d.id));
}

function toSeries(
  rows: MonthStripRow[],
  defs: SeriesDef[],
  enabled: Set<string>
): HoverSeries[] {
  return defs
    .filter((d) => enabled.has(d.id))
    .map((d, i) => ({
      id: d.id,
      label: d.label,
      color: chartColor(i),
      points: rows
        .map((m) => {
          const v = d.value(m);
          if (v == null) return null;
          return { date: m.pointDate, value: v };
        })
        .filter(Boolean) as { date: string; value: number }[],
    }));
}

function ViewToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  return (
    <div className="flex gap-1 rounded-pill border border-border bg-white p-0.5">
      {(["table", "chart"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={cn(
            "rounded-pill px-3 py-1 text-[11px] font-semibold uppercase tracking-eyebrow",
            mode === m
              ? "bg-navy text-white"
              : "text-muted hover:text-navy"
          )}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

export function RoundYearCharts({
  rows,
  grain = "month",
}: {
  rows: MonthStripRow[];
  grain?: "month" | "week";
}) {
  const [round, setRound] = useState<RoundKey>("R1");
  const [view, setView] = useState<ViewMode>("table");
  const [enabled, setEnabled] = useState<Record<RoundKey, Set<string>>>(() => ({
    R1: defaultEnabled(R1_SERIES),
    R2: defaultEnabled(R2_SERIES),
    R3: defaultEnabled(R3_SERIES),
  }));

  const defs = SERIES_BY_ROUND[round];
  const on = enabled[round];

  const countSeries = useMemo(
    () => toSeries(rows, defs.filter((d) => d.kind === "count"), on),
    [rows, defs, on]
  );
  const rateSeries = useMemo(
    () => toSeries(rows, defs.filter((d) => d.kind === "rate"), on),
    [rows, defs, on]
  );

  function toggle(id: string) {
    setEnabled((prev) => {
      const next = new Set(prev[round]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, [round]: next };
    });
  }

  if (!rows.length) {
    return (
      <p className="text-sm text-muted">
        No {grain === "week" ? "weekly" : "monthly"} data for this range.
      </p>
    );
  }

  const periodLabel = grain === "week" ? "Week" : "Month";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {(["R1", "R2", "R3"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRound(r)}
              className={cn(
                "rounded-pill px-3 py-1.5 text-xs font-semibold uppercase tracking-eyebrow",
                round === r
                  ? "bg-navy text-white"
                  : "border border-border bg-white text-muted hover:text-navy"
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <ViewToggle mode={view} onChange={setView} />
      </div>

      {view === "table" ? (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-navy/[0.02]">
              <tr>
                <th className="eyebrow sticky left-0 bg-navy/[0.02] px-3 py-2">
                  {periodLabel}
                </th>
                {defs.map((d) => (
                  <th
                    key={d.id}
                    className={cn(
                      "eyebrow px-2 py-2 text-right",
                      d.kind === "rate" ? "text-periwinkle" : ""
                    )}
                  >
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.month}
                  className="border-b border-border last:border-0"
                >
                  <td className="sticky left-0 bg-white px-3 py-2 font-medium text-navy">
                    {row.label}
                  </td>
                  {defs.map((d) => {
                    const v = d.value(row);
                    return (
                      <td
                        key={d.id}
                        className={cn(
                          "px-2 py-2 text-right tabular-nums",
                          d.kind === "rate"
                            ? "font-medium text-navy"
                            : "text-muted"
                        )}
                      >
                        {d.kind === "rate" ? fmtPct(v) : fmtCount(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {defs.map((d) => (
              <label
                key={d.id}
                className="inline-flex items-center gap-1.5 text-[11px] text-muted"
              >
                <input
                  type="checkbox"
                  className="rounded border-border"
                  checked={on.has(d.id)}
                  onChange={() => toggle(d.id)}
                />
                <span className={d.kind === "rate" ? "text-periwinkle" : ""}>
                  {d.label}
                </span>
              </label>
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                Volumes
              </p>
              <HoverLineChart series={countSeries} height={200} />
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                Rates (%)
              </p>
              <HoverLineChart
                series={rateSeries}
                height={200}
                valueFormatter={(n) => `${n.toFixed(1)}%`}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
