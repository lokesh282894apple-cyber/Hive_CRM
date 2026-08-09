import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard } from "@/components/ui/Primitives";
import { fetchAdmissionsAnalytics } from "@/lib/analytics/admissions";
import { BarChart, DonutChart, DualTrend, HBarList } from "@/components/charts/SimpleCharts";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";

/** Deep analytics twin of the admin dashboard — fees, loans, full stage table. */
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
    <div>
      <PageHeader
        eyebrow="Admin · Analytics"
        title="Deep"
        accent="Analytics"
        description="Full-funnel conversion, counselor productivity, fees, loans, and marketing handoffs — same data model as the command dashboard."
        actions={
          <div className="flex flex-wrap gap-2">
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Leads in CRM" value={kpis.totalLeads} />
        <StatCard label="Win rate" value={`${kpis.winRate.toFixed(1)}%`} />
        <StatCard label="Fee collected" value={formatCurrency(kpis.feeCollected)} />
        <StatCard label="Fee outstanding" value={formatCurrency(kpis.feeOutstanding)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <p className="eyebrow">Trend</p>
          <h2 className="mt-1 text-lg font-semibold text-navy">Leads created vs calls</h2>
          <DualTrend
            className="mt-4"
            series={data.daily.map((d) => ({
              date: d.date,
              a: d.leads,
              b: d.calls,
              aLabel: "Leads",
              bLabel: "Calls",
            }))}
          />
        </section>
        <section className="panel p-5">
          <p className="eyebrow">Funnel groups</p>
          <h2 className="mt-1 text-lg font-semibold text-navy">Bar depth</h2>
          <BarChart
            className="mt-4"
            data={data.funnelGroups.map((g) => ({ name: g.name, value: g.count }))}
            height={180}
          />
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <p className="eyebrow">All stages</p>
          <HBarList
            className="mt-4 max-h-[420px] overflow-y-auto"
            data={data.stageBreakdown.map((s) => ({ name: s.name, value: s.count }))}
          />
        </section>
        <section className="panel p-5">
          <p className="eyebrow">Sources · pie</p>
          <DonutChart
            className="mt-4"
            data={data.sourceMix.map((s) => ({ name: s.name, value: s.count }))}
          />
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <p className="eyebrow">Counselor load</p>
          <BarChart
            className="mt-4"
            data={data.counselorBoard.map((c) => ({ name: c.name, value: c.total }))}
            height={160}
          />
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="eyebrow py-2">Name</th>
                <th className="eyebrow py-2">Open</th>
                <th className="eyebrow py-2">Won</th>
                <th className="eyebrow py-2">Win %</th>
              </tr>
            </thead>
            <tbody>
              {data.counselorBoard.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="py-2 font-medium text-navy">{c.name}</td>
                  <td className="py-2 text-muted">{c.open}</td>
                  <td className="py-2 text-muted">{c.won}</td>
                  <td className="py-2 font-semibold text-periwinkle">
                    {c.winRate.toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel p-5">
          <p className="eyebrow">Loans · vendors</p>
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="eyebrow py-2">Vendor</th>
                <th className="eyebrow py-2">Sent</th>
                <th className="eyebrow py-2">Approved+</th>
                <th className="eyebrow py-2">Rate</th>
              </tr>
            </thead>
            <tbody>
              {data.vendorLoanStats.map((v) => (
                <tr key={v.name} className="border-b border-border last:border-0">
                  <td className="py-2">{v.name}</td>
                  <td className="py-2">{v.sent}</td>
                  <td className="py-2">{v.approved}</td>
                  <td className="py-2 font-semibold text-periwinkle">{v.rate}%</td>
                </tr>
              ))}
              {data.vendorLoanStats.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-muted">
                    No loan data yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <div className="mt-4">
            <DonutChart
              data={data.paymentModeMix.map((p) => ({ name: p.name, value: p.count }))}
            />
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Web sessions"
          value={kpis.sessionsInRange}
          hint={`Last ${rangeDays}d`}
        />
        <StatCard
          label="Form conversions"
          value={kpis.formConversionsInRange}
          hint="Attributed"
        />
        <StatCard label="Marketing attributed leads" value={kpis.attributed} />
      </div>
    </div>
  );
}
