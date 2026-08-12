import { cn } from "@/lib/utils";

export type ChartDatum = { name: string; value: number; color?: string };

/** Quieter single-hue ramp — less noisy than rainbow bars */
const PALETTE = [
  "#4F46E5",
  "#6366F1",
  "#818CF8",
  "#0F2744",
  "#334155",
  "#C9A227",
  "#059669",
  "#64748B",
];

export function chartColor(i: number) {
  return PALETTE[i % PALETTE.length];
}

/** Vertical bar chart */
export function BarChart({
  data,
  height = 160,
  className,
}: {
  data: ChartDatum[];
  height?: number;
  className?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) {
    return <p className="py-8 text-center text-sm text-muted">No data yet.</p>;
  }
  return (
    <div className={cn("flex items-end gap-1", className)} style={{ height }}>
      {data.map((d, i) => (
        <div
          key={d.name}
          className="group relative flex min-w-0 flex-1 flex-col items-center justify-end"
          title={`${d.name}: ${d.value}`}
        >
          <div
            className="w-full max-w-[28px] rounded-t"
            style={{
              height: `${(d.value / max) * 100}%`,
              minHeight: d.value ? 3 : 0,
              background: d.color ?? chartColor(i),
            }}
          />
          <span className="mt-1 hidden w-full truncate text-center text-[9px] text-muted sm:block">
            {d.name.length > 6 ? d.name.slice(0, 5) + "…" : d.name}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Horizontal bars with labels */
export function HBarList({
  data,
  className,
}: {
  data: ChartDatum[];
  className?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) {
    return <p className="py-6 text-sm text-muted">No data yet.</p>;
  }
  return (
    <ul className={cn("space-y-2.5", className)}>
      {data.map((d, i) => (
        <li key={d.name}>
          <div className="mb-1 flex items-center justify-between gap-2 text-sm">
            <span className="truncate font-medium text-navy" title={d.name}>
              {d.name}
            </span>
            <span className="shrink-0 font-semibold text-periwinkle">{d.value}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-navy/[0.06]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(d.value / max) * 100}%`,
                background: d.color ?? (i === 0 ? "#4F46E5" : chartColor(i)),
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Simple CSS donut / pie using conic-gradient */
export function DonutChart({
  data,
  className,
  size = 160,
}: {
  data: ChartDatum[];
  className?: string;
  size?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) {
    return <p className="py-8 text-center text-sm text-muted">No data yet.</p>;
  }

  let cursor = 0;
  const stops: string[] = [];
  data.forEach((d, i) => {
    const start = cursor;
    const pct = (d.value / total) * 100;
    cursor += pct;
    stops.push(`${d.color ?? chartColor(i)} ${start}% ${cursor}%`);
  });

  return (
    <div className={cn("flex flex-col items-center gap-4 sm:flex-row sm:items-start", className)}>
      <div
        className="relative shrink-0 rounded-full"
        style={{
          width: size,
          height: size,
          background: `conic-gradient(${stops.join(", ")})`,
        }}
      >
        <div className="absolute inset-[28%] flex flex-col items-center justify-center rounded-full bg-white">
          <span className="text-lg font-semibold text-navy">{total}</span>
          <span className="text-[10px] uppercase tracking-eyebrow text-muted">Total</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: d.color ?? chartColor(i) }}
            />
            <span className="min-w-0 flex-1 truncate text-navy">{d.name}</span>
            <span className="shrink-0 text-muted">
              {d.value} · {((d.value / total) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Confidence badge for forecasts */
export function ForecastBadge({
  confidence,
  reason,
}: {
  confidence: "low" | "medium" | "high";
  reason?: string;
}) {
  const tone =
    confidence === "high"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : confidence === "medium"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-border bg-navy/[0.03] text-muted";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-eyebrow ${tone}`}
      title={reason}
    >
      Forecast · {confidence}
    </span>
  );
}

/** Line chart with solid history + optional dashed forecast */
export function LineChart({
  series,
  height = 160,
  className,
  dimForecast = false,
}: {
  series: {
    id: string;
    label: string;
    color: string;
    points: { date: string; value: number }[];
    dashed?: boolean;
  }[];
  height?: number;
  className?: string;
  dimForecast?: boolean;
}) {
  const all = series.flatMap((s) => s.points);
  if (!all.length) {
    return <p className="py-8 text-center text-sm text-muted">No data yet.</p>;
  }
  const dates = Array.from(new Set(all.map((p) => p.date))).sort();
  const max = Math.max(1, ...all.map((p) => p.value));
  const padX = 8;
  const padY = 12;
  const w = 400;
  const h = height;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;

  function xAt(i: number, n: number) {
    if (n <= 1) return padX + innerW / 2;
    return padX + (i / (n - 1)) * innerW;
  }
  function yAt(v: number) {
    return padY + innerH - (v / max) * innerH;
  }
  function pathFor(points: { date: string; value: number }[]) {
    const map = new Map(points.map((p) => [p.date, p.value]));
    const pts = dates
      .map((d, i) => {
        const v = map.get(d);
        if (v == null) return null;
        return `${xAt(i, dates.length)},${yAt(v)}`;
      })
      .filter(Boolean);
    if (!pts.length) return "";
    return `M ${pts.join(" L ")}`;
  }

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-2 flex flex-wrap gap-3 text-[11px] text-muted">
        {series.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1.5">
            <span
              className="h-0.5 w-3"
              style={{
                background: s.color,
                opacity: s.dashed && dimForecast ? 0.45 : 1,
                borderTop: s.dashed ? `2px dashed ${s.color}` : undefined,
                height: s.dashed ? 0 : 2,
              }}
            />
            {s.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img">
        <line
          x1={padX}
          y1={padY + innerH}
          x2={padX + innerW}
          y2={padY + innerH}
          stroke="currentColor"
          strokeOpacity={0.08}
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
              strokeWidth={2}
              strokeDasharray={s.dashed ? "5 4" : undefined}
              strokeOpacity={s.dashed && dimForecast ? 0.45 : 0.9}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
      </svg>
    </div>
  );
}

/** Dual series with independent scales so a small series stays visible. */
export function DualTrend({
  series,
  className,
  height = 140,
}: {
  series: { date: string; a: number; b: number; aLabel?: string; bLabel?: string }[];
  className?: string;
  height?: number;
}) {
  const maxA = Math.max(1, ...series.map((d) => d.a));
  const maxB = Math.max(1, ...series.map((d) => d.b));
  if (!series.length) {
    return <p className="py-8 text-center text-sm text-muted">No data yet.</p>;
  }
  const half = Math.max(24, Math.floor((height - 8) / 2));
  return (
    <div className={className}>
      <div className="mb-2 flex gap-4 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-periwinkle" /> {series[0]?.aLabel ?? "Series A"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-gold" /> {series[0]?.bLabel ?? "Series B"}
        </span>
      </div>
      <div className="flex items-end gap-0.5" style={{ height }}>
        {series.map((d) => (
          <div
            key={d.date}
            className="flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5"
            title={`${d.date}: ${d.a} / ${d.b}`}
          >
            <div
              className="w-full rounded-t bg-periwinkle/75"
              style={{
                height: d.a ? Math.max(4, Math.round((d.a / maxA) * half)) : 0,
              }}
            />
            <div
              className="w-full rounded-t bg-gold"
              style={{
                height: d.b ? Math.max(4, Math.round((d.b / maxB) * half)) : 0,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Day-by-day visits vs form fills — readable for marketers (own scale per metric). */
export function DailyVisitsConversions({
  days,
  className,
}: {
  days: { date: string; sessions: number; conversions: number }[];
  className?: string;
}) {
  if (!days.length) {
    return <p className="py-8 text-center text-sm text-muted">No traffic in this range yet.</p>;
  }

  // Latest 14 days so bars stay wide; totals still cover full range
  const recent = days.length > 14 ? days.slice(-14) : days;
  const maxSessions = Math.max(1, ...recent.map((d) => d.sessions));
  const maxConv = Math.max(1, ...recent.map((d) => d.conversions));
  const totalSessions = days.reduce((s, d) => s + d.sessions, 0);
  const totalConv = days.reduce((s, d) => s + d.conversions, 0);
  const BAR_MAX_PX = 140;

  function shortDay(iso: string) {
    const d = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return iso.slice(5);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }

  function barPx(value: number, max: number) {
    if (!value) return 0;
    return Math.max(14, Math.round((value / max) * BAR_MAX_PX));
  }

  return (
    <div className={className}>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-navy">Website visits</p>
            <p className="text-xs text-muted">{totalSessions} total in range</p>
          </div>
          <p className="mb-3 text-xs text-muted">
            People who started a visit that day (India time). Latest {recent.length} days below.
          </p>
          <div
            className="flex items-end gap-1.5 rounded-xl border border-border bg-[#F7F8FC] px-3 pb-2 pt-3"
            style={{ height: BAR_MAX_PX + 24 }}
          >
            {recent.map((d) => {
              const h = barPx(d.sessions, maxSessions);
              return (
                <div
                  key={`s-${d.date}`}
                  className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                  title={`${shortDay(d.date)}: ${d.sessions} visits`}
                >
                  {d.sessions > 0 ? (
                    <span className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded bg-navy px-1.5 py-0.5 text-[10px] font-semibold text-white group-hover:block">
                      {d.sessions}
                    </span>
                  ) : null}
                  <div
                    className="w-full min-w-[8px] max-w-[36px] rounded-t bg-periwinkle"
                    style={{ height: h }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-navy">Form fills</p>
            <p className="text-xs text-muted">{totalConv} total in range</p>
          </div>
          <p className="mb-3 text-xs text-muted">
            Form submits that became leads that day (India time).
          </p>
          <div
            className="flex items-end gap-1.5 rounded-xl border border-border bg-[#F7F8FC] px-3 pb-2 pt-3"
            style={{ height: BAR_MAX_PX + 24 }}
          >
            {recent.map((d) => {
              const h = barPx(d.conversions, maxConv);
              return (
                <div
                  key={`c-${d.date}`}
                  className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                  title={`${shortDay(d.date)}: ${d.conversions} form fills`}
                >
                  {d.conversions > 0 ? (
                    <span className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded bg-navy px-1.5 py-0.5 text-[10px] font-semibold text-white group-hover:block">
                      {d.conversions}
                    </span>
                  ) : null}
                  <div
                    className="w-full min-w-[8px] max-w-[36px] rounded-t bg-gold"
                    style={{ height: h }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead className="border-b border-border bg-[#F7F8FC] text-[11px] uppercase tracking-eyebrow text-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">Day</th>
              <th className="px-3 py-2 font-semibold">Visits</th>
              <th className="px-3 py-2 font-semibold">Form fills</th>
              <th className="px-3 py-2 font-semibold">Fill rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {[...recent].reverse().map((d) => {
              const rate =
                d.sessions > 0
                  ? `${((d.conversions / d.sessions) * 100).toFixed(1)}%`
                  : d.conversions > 0
                    ? "n/a"
                    : "—";
              return (
                <tr key={d.date} className="text-navy">
                  <td className="px-3 py-2 font-medium">{shortDay(d.date)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="w-8 tabular-nums">{d.sessions}</span>
                      <span
                        className="h-2 rounded-full bg-periwinkle/70"
                        style={{
                          width: `${Math.max(
                            d.sessions ? 12 : 0,
                            (d.sessions / maxSessions) * 96
                          )}px`,
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{d.conversions}</td>
                  <td
                    className="px-3 py-2 text-muted"
                    title={
                      rate === "n/a"
                        ? "Form fills that day without a tracked visit starting the same day (they may have started browsing on an earlier day)."
                        : undefined
                    }
                  >
                    {rate}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="border-t border-border px-3 py-2 text-[11px] text-muted">
          Days use India time (IST). Fill rate = form fills ÷ visits that day.
          {days.length > 14
            ? ` Showing latest 14 of ${days.length} days in range.`
            : null}
        </p>
      </div>
    </div>
  );
}
