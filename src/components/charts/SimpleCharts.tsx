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

/** Dual-series mini trend (leads vs calls) */
export function DualTrend({
  series,
  className,
  height = 140,
}: {
  series: { date: string; a: number; b: number; aLabel?: string; bLabel?: string }[];
  className?: string;
  height?: number;
}) {
  const max = Math.max(1, ...series.map((d) => Math.max(d.a, d.b)));
  if (!series.length) {
    return <p className="py-8 text-center text-sm text-muted">No data yet.</p>;
  }
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
              style={{ height: `${(d.a / max) * 100}%`, minHeight: d.a ? 2 : 0 }}
            />
            <div
              className="w-full rounded-t bg-gold"
              style={{ height: `${(d.b / max) * 100}%`, minHeight: d.b ? 2 : 0 }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
