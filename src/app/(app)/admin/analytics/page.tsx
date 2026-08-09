import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Primitives";
import { fetchAdmissionsAnalytics } from "@/lib/analytics/admissions";
import { DonutChart, DualTrend, HBarList } from "@/components/charts/SimpleCharts";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-navy">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function Section({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel overflow-hidden ${className}`}>
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold text-navy">{title}</h2>
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

  const data = await fetchAdmissionsAnalytics(supabase, { rangeDays });
  const { kpis } = data;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin · Analytics"
        title="Deep"
        accent="Cut"
        description="Full stage table, sources, fees, and loan rates — same data as Overview."
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
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Leads in CRM" value={kpis.totalLeads} />
          <Metric label="Win rate" value={`${kpis.winRate.toFixed(1)}%`} />
          <Metric label="Fee collected" value={formatCurrency(kpis.feeCollected)} />
          <Metric label="Fee outstanding" value={formatCurrency(kpis.feeOutstanding)} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <Section title={`Leads vs calls · ${rangeDays}d`} className="lg:col-span-3">
          <DualTrend
            height={160}
            series={data.daily.map((d) => ({
              date: d.date,
              a: d.leads,
              b: d.calls,
              aLabel: "Leads",
              bLabel: "Calls",
            }))}
          />
        </Section>
        <Section title="Funnel groups" className="lg:col-span-2">
          <HBarList
            data={data.funnelGroups.map((g) => ({ name: g.name, value: g.count }))}
          />
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Every stage">
          <div className="max-h-[420px] overflow-y-auto pr-1">
            <HBarList
              data={data.stageBreakdown.map((s) => ({ name: s.name, value: s.count }))}
            />
          </div>
        </Section>
        <Section title="Sources">
          <DonutChart
            size={130}
            data={data.sourceMix.map((s) => ({ name: s.name, value: s.count }))}
          />
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Counselors">
          <div className="-mx-5 -mb-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-navy/[0.02]">
                <tr>
                  <th className="eyebrow px-5 py-2.5">Name</th>
                  <th className="eyebrow px-4 py-2.5">Total</th>
                  <th className="eyebrow px-4 py-2.5">Open</th>
                  <th className="eyebrow px-4 py-2.5">Won</th>
                  <th className="eyebrow px-5 py-2.5">Win %</th>
                </tr>
              </thead>
              <tbody>
                {data.counselorBoard.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 font-medium text-navy">{c.name}</td>
                    <td className="px-4 py-3 text-muted">{c.total}</td>
                    <td className="px-4 py-3 text-muted">{c.open}</td>
                    <td className="px-4 py-3 text-muted">{c.won}</td>
                    <td className="px-5 py-3 font-semibold text-periwinkle">
                      {c.winRate.toFixed(0)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
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
    </div>
  );
}
