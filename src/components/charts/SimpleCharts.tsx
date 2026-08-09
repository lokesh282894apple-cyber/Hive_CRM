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
