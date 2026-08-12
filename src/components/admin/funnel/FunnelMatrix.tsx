import Link from "next/link";
import type { RoundKey, RoundMetrics } from "@/lib/analytics/admissions-funnel";

function fmtPct(n: number | null) {
  if (n == null) return "—";
  return `${n.toFixed(0)}%`;
}

function leadsHref(opts: {
  group?: string;
  courseId?: string | null;
  cohortId?: string | null;
  counselorId?: string | null;
}) {
  const q = new URLSearchParams();
  q.set("view", "list");
  if (opts.group) q.set("group", opts.group);
  if (opts.courseId) q.set("course", opts.courseId);
  if (opts.cohortId) q.set("cohort", opts.cohortId);
  if (opts.counselorId) q.set("owner", opts.counselorId);
  return `/admin/leads?${q.toString()}`;
}

type Row = {
  label: string;
  count: number;
  pct: number | null;
  href?: string;
  emphasize?: boolean;
};

export function FunnelMatrix({
  round,
  metrics,
  courseId,
  cohortId,
  counselorId,
}: {
  round: RoundKey;
  metrics: RoundMetrics;
  courseId?: string | null;
  cohortId?: string | null;
  counselorId?: string | null;
}) {
  const group = round.toLowerCase();
  const base = { courseId, cohortId, counselorId };
  const nextLabel =
    round === "R1" ? "R2 Moved" : round === "R2" ? "R3 Moved" : "Offered";
  const rejectLabel = round === "R3" ? "Reject (booking)" : `${round} Reject`;

  const rows: Row[] = [
    {
      label: "On Calendar",
      count: metrics.onCalendar,
      pct: null,
      href: leadsHref({ ...base, group }),
      emphasize: true,
    },
    {
      label: "→ No Show",
      count: metrics.noShow,
      pct: metrics.rates.noShow,
      href: leadsHref({ ...base, group }),
    },
    {
      label: "→ Reschedule",
      count: metrics.reschedule,
      pct: metrics.rates.reschedule,
      href: leadsHref({ ...base, group }),
    },
    {
      label: "→ Conducted",
      count: metrics.conducted,
      pct: metrics.rates.conducted,
      href: leadsHref({ ...base, group }),
      emphasize: true,
    },
    {
      label: `Conducted → ${nextLabel}`,
      count: metrics.moved,
      pct: metrics.rates.moved,
      href: leadsHref({
        ...base,
        group: round === "R1" ? "r2" : round === "R2" ? "r3" : "offer",
      }),
    },
    {
      label: `Conducted → ${rejectLabel}`,
      count: metrics.reject,
      pct: metrics.rates.reject,
      href: leadsHref({ ...base, group }),
    },
    {
      label: "Conducted → Yet to move",
      count: metrics.yetToMove,
      pct: rateYet(metrics),
      href: leadsHref({ ...base, group }),
    },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-navy">{round} Funnel</h3>
        {metrics.weakest ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-eyebrow text-amber-800">
            Weak: {metrics.weakest.key} {fmtPct(metrics.weakest.rate)}
          </span>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-navy/[0.02]">
            <tr>
              <th className="eyebrow sticky left-0 bg-[#F7F8FC] px-4 py-2">Status</th>
              <th className="eyebrow px-3 py-2 text-right">Count</th>
              <th className="eyebrow px-4 py-2 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-border last:border-0">
                <td
                  className={`sticky left-0 bg-white px-4 py-2.5 ${
                    r.emphasize ? "font-semibold text-navy" : "text-navy"
                  }`}
                >
                  {r.href ? (
                    <Link href={r.href} className="hover:text-periwinkle hover:underline">
                      {r.label}
                    </Link>
                  ) : (
                    r.label
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                  {r.count}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted">
                  {fmtPct(r.pct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function rateYet(m: RoundMetrics): number | null {
  if (m.conducted <= 0) return null;
  return (m.yetToMove / m.conducted) * 100;
}

export function OfferFunnelMatrix({
  offered,
  won,
  lost,
  wonRate,
  lostRate,
  courseId,
  cohortId,
  counselorId,
}: {
  offered: number;
  won: number;
  lost: number;
  wonRate: number | null;
  lostRate: number | null;
  courseId?: string | null;
  cohortId?: string | null;
  counselorId?: string | null;
}) {
  const base = { courseId, cohortId, counselorId };
  const rows: Row[] = [
    {
      label: "Total Offered",
      count: offered,
      pct: null,
      href: leadsHref({ ...base, group: "offer" }),
      emphasize: true,
    },
    {
      label: "Closed — Won",
      count: won,
      pct: wonRate,
      href: leadsHref({ ...base, group: "all" }),
    },
    {
      label: "Closed — Lost",
      count: lost,
      pct: lostRate,
      href: leadsHref({ ...base, group: "all" }),
    },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-navy">Offer Funnel</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-navy/[0.02]">
            <tr>
              <th className="eyebrow sticky left-0 bg-[#F7F8FC] px-4 py-2">Status</th>
              <th className="eyebrow px-3 py-2 text-right">Count</th>
              <th className="eyebrow px-4 py-2 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-border last:border-0">
                <td
                  className={`sticky left-0 bg-white px-4 py-2.5 ${
                    r.emphasize ? "font-semibold text-navy" : "text-navy"
                  }`}
                >
                  {r.href ? (
                    <Link href={r.href} className="hover:text-periwinkle hover:underline">
                      {r.label}
                    </Link>
                  ) : (
                    r.label
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                  {r.count}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted">
                  {fmtPct(r.pct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
