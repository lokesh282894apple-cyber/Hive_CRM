import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Primitives";
import { fetchFounderCommand } from "@/lib/analytics/founder-command";
import {
  BarChart,
  DonutChart,
  ForecastBadge,
  HBarList,
  LineChart,
} from "@/components/charts/SimpleCharts";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";

function Section({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold text-navy">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  await requireUser(["admin"]);
  const supabase = createClient();
  const rangeDays = ["7", "30", "90"].includes(searchParams.range ?? "")
    ? Number(searchParams.range)
    : 30;

  const cmd = await fetchFounderCommand(supabase, { rangeDays });
  const { admissions: data, northStar: ns } = cmd;
  const { kpis } = data;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin · Analytics"
        title="Deep"
        accent="Cut"
        description="Full stages, programmes, cash calendar, and CPE — same command model as Overview."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin/dashboard" className="btn-primary text-xs">
              Overview
            </Link>
            <div className="flex gap-1 rounded-xl border border-border p-1">
              {[7, 30, 90].map((r) => (
                <Link
                  key={r}
                  href={`/admin/analytics?range=${r}`}
                  className={
                    r === rangeDays
                      ? "btn-primary px-3 py-1 text-xs"
                      : "rounded-lg px-3 py-1 text-xs font-semibold text-navy"
                  }
                >
                  {r}d
                </Link>
              ))}
            </div>
          </div>
        }
      />

      <section className="panel p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-navy">
            <strong>{ns.cohortName ?? "Pipeline"}</strong>
            {ns.seats != null
              ? ` · ${ns.won}/${ns.seats} · projected ~${Math.round(ns.projectedFill)}`
              : ` · ${ns.won} won · seats unset`}
          </p>
          <ForecastBadge confidence={cmd.confidence} reason={cmd.confidenceReason} />
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
              Yield
            </p>
            <p className="mt-1 text-2xl font-semibold text-navy">
              {ns.yieldRate.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
              Fee collected
            </p>
            <p className="mt-1 text-2xl font-semibold text-navy">
              {formatCurrency(kpis.feeCollected)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
              Overdue
            </p>
            <p className="mt-1 text-2xl font-semibold text-navy">
              {formatCurrency(cmd.money.overdueAmount)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
              CPE
            </p>
            <p className="mt-1 text-2xl font-semibold text-navy">
              {cmd.cpe.available ? formatCurrency(cmd.cpe.cpe ?? 0) : "—"}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={`Pulse · ${rangeDays}d`} action={<ForecastBadge confidence={cmd.confidence} />}>
          <LineChart
            height={160}
            dimForecast={cmd.confidence === "low"}
            series={[
              {
                id: "leads",
                label: "Leads",
                color: "#4F46E5",
                points: cmd.pulse.historyLeads,
              },
              {
                id: "wins",
                label: "Wins",
                color: "#C9A227",
                points: cmd.pulse.historyWins,
              },
              {
                id: "leads-f",
                label: "Leads forecast",
                color: "#4F46E5",
                points: cmd.pulse.forecastLeads,
                dashed: true,
              },
            ]}
          />
        </Section>
        <Section title="Conversion rates">
          <HBarList
            data={cmd.conversions.map((c) => ({
              name: c.name,
              value: c.rate != null ? Math.round(c.rate) : 0,
            }))}
          />
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Every stage">
          <div className="max-h-[420px] overflow-y-auto pr-1">
            <HBarList
              data={data.stageBreakdown.map((s) => ({
                name: s.name,
                value: s.count,
              }))}
            />
          </div>
        </Section>
        <Section title="Programmes">
          <DonutChart
            size={130}
            data={data.courseMix.map((s) => ({ name: s.name, value: s.count }))}
          />
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Cash · expected">
          <BarChart data={cmd.money.expectedBars} height={120} />
          <p className="mt-3 text-xs text-muted">
            Next 14d {formatCurrency(cmd.money.expected14d)} · Next 30d{" "}
            {formatCurrency(cmd.money.expected30d)}
          </p>
        </Section>
        <Section title="Counselor won">
          <BarChart
            height={140}
            data={cmd.counselorExec.map((c) => ({ name: c.name, value: c.won }))}
          />
        </Section>
      </div>

      <Section title="Loan vendors">
        {data.vendorLoanStats.length === 0 ? (
          <p className="text-sm text-muted">No loan data yet.</p>
        ) : (
          <div className="-mx-5 -mb-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-navy/[0.02]">
                <tr>
                  <th className="eyebrow px-5 py-2.5">Vendor</th>
                  <th className="eyebrow px-4 py-2.5">Sent</th>
                  <th className="eyebrow px-4 py-2.5">Approved+</th>
                  <th className="eyebrow px-5 py-2.5">Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.vendorLoanStats.map((v) => (
                  <tr key={v.name} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 font-medium text-navy">{v.name}</td>
                    <td className="px-4 py-3 text-muted">{v.sent}</td>
                    <td className="px-4 py-3 text-muted">{v.approved}</td>
                    <td className="px-5 py-3 font-semibold text-periwinkle">{v.rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
