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

export function ConversionYearChart({
  rows,
  grain = "month",
}: {
  rows: MonthStripRow[];
  grain?: "month" | "week";
}) {
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

  return (
    <div className="space-y-4">
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
    </div>
  );
}
