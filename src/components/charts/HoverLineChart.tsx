"use client";

import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type HoverPoint = { date: string; value: number };
export type HoverSeries = {
  id: string;
  label: string;
  color: string;
  points: HoverPoint[];
  dashed?: boolean;
  /** When true, series is dimmed (e.g. low-confidence forecast). */
  dim?: boolean;
};

function shortDate(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatNum(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 100) return Math.round(n).toLocaleString("en-IN");
  if (Math.abs(n) >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

export function HoverLineChart({
  series,
  height = 220,
  className,
  valueFormatter = formatNum,
}: {
  series: HoverSeries[];
  height?: number;
  className?: string;
  valueFormatter?: (n: number) => string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{
    index: number;
    xPct: number;
  } | null>(null);

  const { dates, max, min } = useMemo(() => {
    const all = series.flatMap((s) => s.points);
    const dates = Array.from(new Set(all.map((p) => p.date))).sort();
    const vals = all.map((p) => p.value);
    const max = Math.max(1, ...vals);
    const min = Math.min(0, ...vals);
    return { dates, max, min };
  }, [series]);

  const padX = 12;
  const padY = 16;
  const w = 640;
  const h = height;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const span = Math.max(max - min, 1);

  function xAt(i: number) {
    if (dates.length <= 1) return padX + innerW / 2;
    return padX + (i / (dates.length - 1)) * innerW;
  }
  function yAt(v: number) {
    return padY + innerH - ((v - min) / span) * innerH;
  }
  function pathFor(points: HoverPoint[]) {
    const map = new Map(points.map((p) => [p.date, p.value]));
    const pts: string[] = [];
    dates.forEach((d, i) => {
      const v = map.get(d);
      if (v == null) return;
      pts.push(`${xAt(i)},${yAt(v)}`);
    });
    if (!pts.length) return "";
    return `M ${pts.join(" L ")}`;
  }

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!dates.length || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.min(1, Math.max(0, x / rect.width));
    const index = Math.round(pct * (dates.length - 1));
    setHover({ index, xPct: (index / Math.max(1, dates.length - 1)) * 100 });
  }

  const activeDate = hover ? dates[hover.index] : null;
  const tooltipRows =
    activeDate == null
      ? []
      : series
          .map((s) => {
            const pt = s.points.find((p) => p.date === activeDate);
            if (!pt) return null;
            return { label: s.label, color: s.color, value: pt.value, dashed: s.dashed };
          })
          .filter(Boolean) as {
          label: string;
          color: string;
          value: number;
          dashed?: boolean;
        }[];

  if (!dates.length) {
    return <p className="py-8 text-center text-sm text-muted">No data yet.</p>;
  }

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-3 flex flex-wrap gap-3 text-[11px] text-muted">
        {series.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4"
              style={{
                background: s.dashed ? "transparent" : s.color,
                borderTop: s.dashed ? `2px dashed ${s.color}` : undefined,
                opacity: s.dim ? 0.45 : 1,
              }}
            />
            {s.label}
          </span>
        ))}
      </div>

      <div
        ref={wrapRef}
        className="relative cursor-crosshair select-none"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img">
          {[0.25, 0.5, 0.75].map((t) => (
            <line
              key={t}
              x1={padX}
              y1={padY + innerH * (1 - t)}
              x2={padX + innerW}
              y2={padY + innerH * (1 - t)}
              stroke="currentColor"
              strokeOpacity={0.06}
            />
          ))}
          <line
            x1={padX}
            y1={padY + innerH}
            x2={padX + innerW}
            y2={padY + innerH}
            stroke="currentColor"
            strokeOpacity={0.12}
          />
          {series.map((s) => {
            const d = pathFor(s.points);
            if (!d) return null;
            return (
              <path
                key={s.id}
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth={2.25}
                strokeDasharray={s.dashed ? "6 5" : undefined}
                strokeOpacity={s.dim ? 0.4 : 0.95}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}
          {hover ? (
            <>
              <line
                x1={xAt(hover.index)}
                y1={padY}
                x2={xAt(hover.index)}
                y2={padY + innerH}
                stroke="#0F2744"
                strokeOpacity={0.25}
                strokeDasharray="3 3"
              />
              {series.map((s) => {
                const pt = s.points.find((p) => p.date === activeDate);
                if (!pt) return null;
                return (
                  <circle
                    key={`${s.id}-dot`}
                    cx={xAt(hover.index)}
                    cy={yAt(pt.value)}
                    r={4}
                    fill={s.color}
                    stroke="#fff"
                    strokeWidth={1.5}
                    opacity={s.dim ? 0.5 : 1}
                  />
                );
              })}
            </>
          ) : null}
        </svg>

        {hover && tooltipRows.length ? (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-[148px] rounded-xl border border-border bg-white px-3 py-2 shadow-md"
            style={{
              left: `min(max(${hover.xPct}%, 12%), 88%)`,
              transform: "translateX(-50%)",
            }}
          >
            <p className="text-[11px] font-semibold text-navy">
              {shortDate(activeDate!)}
            </p>
            <ul className="mt-1.5 space-y-1">
              {tooltipRows.map((r) => (
                <li
                  key={r.label}
                  className="flex items-center justify-between gap-4 text-[11px]"
                >
                  <span className="inline-flex items-center gap-1.5 text-muted">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: r.color }}
                    />
                    {r.label}
                    {r.dashed ? " · fcst" : ""}
                  </span>
                  <span className="tabular-nums font-semibold text-navy">
                    {valueFormatter(r.value)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>{shortDate(dates[0]!)}</span>
        <span>{shortDate(dates[dates.length - 1]!)}</span>
      </div>
    </div>
  );
}
