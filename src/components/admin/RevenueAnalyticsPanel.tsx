import type { RevenueReport } from "@/lib/analytics/revenue";
import { StatCard } from "@/components/ui/Primitives";
import { BarChart } from "@/components/charts/SimpleCharts";
import { addDaysKey, todayKey } from "@/lib/analytics/date-range";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";

function buildQuery(params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function RevenueAnalyticsPanel({
  report,
  baseParams,
  basePath = "/admin/analytics",
  payerFilter = "all",
  courses,
  cohorts,
  courseId,
  cohortId,
}: {
  report: RevenueReport;
  baseParams: Record<string, string | undefined>;
  /** Form + filter link target */
  basePath?: string;
  payerFilter?: "all" | "partial" | "complete";
  courses: { id: string; name: string }[];
  cohorts: { id: string; name: string; course_id: string; label: string }[];
  courseId: string | null;
  cohortId: string | null;
}) {
  const { kpis, monthly, byCohort, payers, filters } = report;

  const filteredPayers = payers.filter((p) => {
    if (payerFilter === "complete") return p.complete;
    if (payerFilter === "partial") return !p.complete && p.realised > 0;
    return true;
  });

  const bookedBars = monthly.map((m) => ({
    name: m.month.slice(5),
    value: Math.round(m.booked),
  }));
  const realisedBars = monthly.map((m) => ({
    name: m.month.slice(5),
    value: Math.round(m.realised),
    color: "#059669",
  }));

  const q = {
    ...baseParams,
    tab: "revenue",
    from: filters.fromDate,
    to: filters.toDate,
  };

  const presets = [7, 30, 90] as const;

  return (
    <div className="space-y-6">
      <form
        method="get"
        action={basePath}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-white px-4 py-4"
      >
        <input type="hidden" name="tab" value="revenue" />
        {baseParams.mode ? (
          <input type="hidden" name="mode" value={baseParams.mode} />
        ) : null}
        {baseParams.attribution ? (
          <input type="hidden" name="attribution" value={baseParams.attribution} />
        ) : null}
        {baseParams.counselor ? (
          <input type="hidden" name="counselor" value={baseParams.counselor} />
        ) : null}
        <div>
          <label className="label-field">From date</label>
          <input
            type="date"
            name="from"
            className="input-field mt-1 min-w-[150px]"
            defaultValue={filters.fromDate}
          />
        </div>
        <div>
          <label className="label-field">To date</label>
          <input
            type="date"
            name="to"
            className="input-field mt-1 min-w-[150px]"
            defaultValue={filters.toDate}
          />
        </div>
        <div>
          <label className="label-field">Course</label>
          <select
            name="course"
            className="input-field mt-1 min-w-[160px]"
            defaultValue={courseId ?? ""}
          >
            <option value="">All courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label-field">Cohort</label>
          <select
            name="cohort"
            className="input-field mt-1 min-w-[180px]"
            defaultValue={cohortId ?? ""}
          >
            <option value="">All cohorts</option>
            {cohorts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary">
          Apply
        </button>
        <div className="flex gap-1 rounded-xl border border-border p-1">
          {presets.map((r) => {
            const presetFrom = addDaysKey(todayKey(), -(r - 1));
            const presetTo = todayKey();
            const active =
              filters.fromDate === presetFrom && filters.toDate === presetTo;
            return (
              <Link
                key={r}
                href={`${basePath}${buildQuery({
                  ...q,
                  from: presetFrom,
                  to: presetTo,
                  range: undefined,
                })}`}
                className={
                  active
                    ? "btn-primary px-3 py-1 text-xs"
                    : "rounded-lg px-3 py-1 text-xs font-semibold text-navy"
                }
              >
                {r}d
              </Link>
            );
          })}
        </div>
      </form>

      <p className="text-sm text-muted">
        Booked / realised in{" "}
        <strong className="text-navy">
          {filters.fromDate} → {filters.toDate}
        </strong>
        . Outstanding &amp; complete are for fees booked in this window.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Booked"
          value={formatCurrency(kpis.booked)}
          hint={`${kpis.feeBooks} fee books in range`}
        />
        <StatCard label="Realised" value={formatCurrency(kpis.realised)} hint="Cash in range" />
        <StatCard
          label="Outstanding"
          value={formatCurrency(kpis.outstanding)}
          hint="Still to collect"
        />
        <StatCard
          label="Realisation %"
          value={`${kpis.realisationPct.toFixed(1)}%`}
          hint="Realised ÷ booked (period)"
        />
        <StatCard
          label="Admission fee paid"
          value={kpis.admissionFeePaid}
          hint="First payment logged"
        />
        <StatCard
          label="Complete payers"
          value={kpis.completePayers}
          hint={`${kpis.partialPayers} partial`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel overflow-hidden">
          <div className="border-b border-border px-5 py-3.5">
            <p className="eyebrow">Monthly booked</p>
            <p className="mt-0.5 text-xs text-muted">Offer fees set in month</p>
          </div>
          <div className="p-5">
            <BarChart data={bookedBars} height={180} />
          </div>
        </section>
        <section className="panel overflow-hidden">
          <div className="border-b border-border px-5 py-3.5">
            <p className="eyebrow">Monthly realised</p>
            <p className="mt-0.5 text-xs text-muted">Cash attributed to payment month</p>
          </div>
          <div className="p-5">
            <BarChart data={realisedBars} height={180} />
          </div>
        </section>
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-border px-5 py-3.5">
          <p className="eyebrow">Revenue by cohort</p>
          <p className="mt-0.5 text-xs text-muted">
            Booked · realised · outstanding · complete (in selected dates)
          </p>
        </div>
        {byCohort.length === 0 ? (
          <p className="px-5 py-10 text-sm text-muted">No fee books in this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-navy/[0.02]">
                <tr>
                  <th className="eyebrow px-5 py-2.5">Cohort</th>
                  <th className="eyebrow px-4 py-2.5 text-right">Books</th>
                  <th className="eyebrow px-4 py-2.5 text-right">Booked</th>
                  <th className="eyebrow px-4 py-2.5 text-right">Realised</th>
                  <th className="eyebrow px-4 py-2.5 text-right">Outstanding</th>
                  <th className="eyebrow px-5 py-2.5 text-right">Complete</th>
                </tr>
              </thead>
              <tbody>
                {byCohort.map((c) => (
                  <tr key={c.cohortId ?? "none"} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 font-medium text-navy">{c.label}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">
                      {c.feeBooks}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-navy">
                      {formatCurrency(c.booked)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">
                      {formatCurrency(c.realised)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">
                      {formatCurrency(c.outstanding)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted">
                      {c.complete}
                    </td>
                  </tr>
                ))}
                <tr className="bg-navy/[0.03] font-semibold">
                  <td className="px-5 py-3 text-navy">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums">{kpis.feeBooks}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCurrency(kpis.booked)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCurrency(kpis.realised)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCurrency(kpis.outstanding)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{kpis.completePayers}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div>
            <p className="eyebrow">Payers</p>
            <p className="mt-0.5 text-xs text-muted">Books touching this date range</p>
          </div>
          <div className="flex gap-2 text-xs">
            {(
              [
                ["all", "All"],
                ["partial", "Partial"],
                ["complete", "Complete"],
              ] as const
            ).map(([key, label]) => (
              <Link
                key={key}
                href={`${basePath}${buildQuery({
                  ...q,
                  payers: key === "all" ? undefined : key,
                })}`}
                className={`rounded-lg px-2.5 py-1 font-medium ${
                  payerFilter === key
                    ? "bg-navy text-white"
                    : "border border-border text-muted hover:text-navy"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
        {filteredPayers.length === 0 ? (
          <p className="px-5 py-10 text-sm text-muted">No payers match.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-navy/[0.02]">
                <tr>
                  <th className="eyebrow px-5 py-2.5">Lead</th>
                  <th className="eyebrow px-4 py-2.5">Cohort</th>
                  <th className="eyebrow px-4 py-2.5 text-right">Booked</th>
                  <th className="eyebrow px-4 py-2.5 text-right">Realised</th>
                  <th className="eyebrow px-4 py-2.5 text-right">Outstanding</th>
                  <th className="eyebrow px-5 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayers.slice(0, 100).map((p) => (
                  <tr key={p.leadId} className="border-b border-border last:border-0">
                    <td className="px-5 py-3">
                      <Link
                        href={`/leads/${p.leadId}/fees`}
                        className="font-medium text-periwinkle hover:underline"
                      >
                        {p.leadName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{p.cohortLabel}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCurrency(p.booked)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">
                      {formatCurrency(p.realised)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">
                      {formatCurrency(p.outstanding)}
                    </td>
                    <td className="px-5 py-3 text-xs text-muted">
                      {p.complete
                        ? "Complete"
                        : p.admissionFeePaid
                          ? "Admission paid"
                          : "No payment"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
