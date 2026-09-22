"use client";

import { useMemo, useState } from "react";
import {
  HoverLineChart,
  type HoverSeries,
} from "@/components/charts/HoverLineChart";
import { chartColor } from "@/components/charts/SimpleCharts";
import type {
  ConversionPercents,
  MonthStripRow,
} from "@/lib/analytics/admissions-funnel";
import { cn } from "@/lib/utils";

const ROWS: { key: keyof ConversionPercents; label: string }[] = [
  { key: "r1BookedToOffered", label: "R1 Booked :: Offered" },
  { key: "r2BookedToOffered", label: "R2 Booked :: Offered" },
  { key: "r3BookedToOffered", label: "R3 Booked :: Offered" },
  { key: "r1BookedToConverts", label: "R1 Booked :: Converts" },
  { key: "r2BookedToConverts", label: "R2 Booked :: Converts" },
  { key: "r3BookedToConverts", label: "R3 Booked :: Converts" },
  { key: "offeredToConverts", label: "Offered :: Converts" },
  { key: "leadsToConverts", label: "Leads :: Converts" },
];

type ViewMode = "table" | "chart";

function fmtPct(n: number | null) {
  if (n == null) return "—";
  return `${n.toFixed(1)}%`;
}

export function ConversionYearChart({
  rows,
  grain = "month",
}: {
  rows: MonthStripRow[];
  grain?: "month" | "week";
}) {
  const [view, setView] = useState<ViewMode>("table");
  const [enabled, setEnabled] = useState(() => new Set(ROWS.map((r) => r.key)));

  const series: HoverSeries[] = useMemo(
    () =>
      ROWS.filter((r) => enabled.has(r.key)).map((r, i) => ({
        id: r.key,
        label: r.label,
        color: chartColor(i),
        points: rows
          .map((m) => {
            const v = m.conversionPercents[r.key];
            if (v == null) return null;
            return { date: m.pointDate, value: v };
          })
          .filter(Boolean) as { date: string; value: number }[],
      })),
    [rows, enabled]
  );

  function toggle(key: keyof ConversionPercents) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
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
      <div className="flex justify-end">
        <div className="flex gap-1 rounded-pill border border-border bg-white p-0.5">
          {(["table", "chart"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setView(m)}
              className={cn(
                "rounded-pill px-3 py-1 text-[11px] font-semibold uppercase tracking-eyebrow",
                view === m
                  ? "bg-navy text-white"
                  : "text-muted hover:text-navy"
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {view === "table" ? (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-navy/[0.02]">
              <tr>
                <th className="eyebrow sticky left-0 bg-navy/[0.02] px-3 py-2">
                  {periodLabel}
                </th>
                {ROWS.map((r) => (
                  <th key={r.key} className="eyebrow px-2 py-2 text-right">
                    {r.label}
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
                  {ROWS.map((r) => (
                    <td
                      key={r.key}
                      className="px-2 py-2 text-right tabular-nums font-medium text-navy"
                    >
                      {fmtPct(row.conversionPercents[r.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {ROWS.map((r) => (
              <label
                key={r.key}
                className="inline-flex items-center gap-1.5 text-[11px] text-muted"
              >
                <input
                  type="checkbox"
                  className="rounded border-border"
                  checked={enabled.has(r.key)}
                  onChange={() => toggle(r.key)}
                />
                {r.label}
              </label>
            ))}
          </div>
          <HoverLineChart
            series={series}
            height={220}
            valueFormatter={(n) => `${n.toFixed(1)}%`}
          />
        </>
      )}
    </div>
  );
}
