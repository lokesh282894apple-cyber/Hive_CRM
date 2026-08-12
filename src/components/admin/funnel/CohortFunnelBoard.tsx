import type { CohortFunnelSummary } from "@/lib/analytics/admissions-funnel";
import Link from "next/link";

function fmtPct(n: number | null) {
  if (n == null) return "—";
  return `${n.toFixed(0)}%`;
}

export function CohortFunnelBoard({
  cohorts,
}: {
  cohorts: CohortFunnelSummary[];
}) {
  if (!cohorts.length) {
    return (
      <p className="text-sm text-muted">
        No cohort activity in this filter. Assign leads to cohorts to unlock rollups.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cohorts.map((c) => (
        <div
          key={c.id}
          className="rounded-2xl border border-border bg-[#F7F8FC] p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-navy">{c.name}</h3>
              <p className="mt-0.5 text-xs text-muted">
                {c.leadTotals.total} leads · {c.leadTotals.organic} org ·{" "}
                {c.leadTotals.inorganic} inorg
              </p>
            </div>
            <Link
              href={`/admin/leads?cohort=${c.id}&view=list`}
              className="text-xs font-semibold text-periwinkle hover:underline"
            >
              Leads
            </Link>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted">R1 on-cal</dt>
              <dd className="font-semibold tabular-nums text-navy">
                {c.roundFunnel.R1.onCalendar}
              </dd>
              <dd className="text-xs text-muted">
                {fmtPct(c.roundFunnel.R1.rates.conducted)} done
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">R2 on-cal</dt>
              <dd className="font-semibold tabular-nums text-navy">
                {c.roundFunnel.R2.onCalendar}
              </dd>
              <dd className="text-xs text-muted">
                {fmtPct(c.roundFunnel.R2.rates.conducted)} done
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Offered</dt>
              <dd className="font-semibold tabular-nums text-navy">
                {c.offerFunnel.offered}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Won</dt>
              <dd className="font-semibold tabular-nums text-navy">
                {c.offerFunnel.won}
              </dd>
              <dd className="text-xs text-muted">
                {fmtPct(c.offerFunnel.rates.won)} yield
              </dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}
