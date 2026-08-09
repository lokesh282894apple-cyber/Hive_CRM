import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard } from "@/components/ui/Primitives";
import { fetchAdmissionsAnalytics } from "@/lib/analytics/admissions";
import { BarChart, DonutChart, DualTrend, HBarList } from "@/components/charts/SimpleCharts";
import { STAGE_LABELS, type Stage } from "@/lib/constants";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import Link from "next/link";

export default async function AdminDashboardPage({
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

  const ranges = [7, 30, 90];

  return (
    <div>
      <PageHeader
        eyebrow="Admin · Command center"
        title="Admissions"
        accent="Overview"
        description="Summary at the top, deep funnel / counselor / marketing / fees analytics below. Switch the window to zoom trends."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/analytics" className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-navy">
              Deep analytics
            </Link>
            <Link href="/admin/leads" className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-navy">
              All leads
            </Link>
            <Link href="/marketing/dashboard" className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-navy">
              Marketing
            </Link>
            <div className="flex gap-1 rounded-xl border border-border p-1">
              {ranges.map((r) => (
                <Link
                  key={r}
                  href={`/admin/dashboard?range=${r}`}
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

      {/* ── Summary strip ── */}
      <section className="panel mb-6 p-5">
        <p className="eyebrow">At a glance</p>
        <p className="mt-2 max-w-3xl text-sm text-navy">
          <strong>{kpis.totalLeads}</strong> leads in CRM ·{" "}
          <strong>{kpis.openLeads}</strong> open ·{" "}
          <strong>{kpis.won}</strong> won ({kpis.winRate.toFixed(0)}% of closed) ·{" "}
          <strong>{kpis.unassigned}</strong> unassigned ·{" "}
          <strong>{kpis.attributed}</strong> marketing-attributed ·{" "}
          <strong>{kpis.sessionsInRange}</strong> web sessions /{" "}
          <strong>{kpis.formConversionsInRange}</strong> form handoffs in last {rangeDays}d · fees{" "}
          <strong>{formatCurrency(kpis.feeCollected)}</strong> collected /{" "}
          <strong>{formatCurrency(kpis.feeOutstanding)}</strong> outstanding.
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <StatCard label="Total leads" value={kpis.totalLeads} />
        <StatCard label="Open pipeline" value={kpis.openLeads} />
        <StatCard label="New / unworked" value={kpis.newLeads} />
        <StatCard label="Needs attention" value={kpis.attentionLeads} hint="DNP / no-show" />
        <StatCard label="Closed won" value={kpis.won} />
        <StatCard label="Win rate" value={`${kpis.winRate.toFixed(0)}%`} hint="Of closed" />
        <StatCard label="Unassigned" value={kpis.unassigned} />
        <StatCard label="Calls (range)" value={kpis.callsInRange} hint={`Last ${rangeDays}d`} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Interviews today" value={kpis.interviewsToday} />
        <StatCard label="Interviews (7d)" value={kpis.interviewsUpcoming} />
        <StatCard label="Web sessions" value={kpis.sessionsInRange} hint={`Last ${rangeDays}d`} />
        <StatCard
          label="Form → CRM"
          value={kpis.formConversionsInRange}
          hint="Attributed conversions"
        />
      </div>

      {/* ── Trends + funnel ── */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <p className="eyebrow">Trend · {rangeDays}d</p>
          <h2 className="mt-1 text-lg font-semibold text-navy">New leads vs calls</h2>
          <div className="mt-4">
            <DualTrend
              series={data.daily.map((d) => ({
                date: d.date,
                a: d.leads,
                b: d.calls,
                aLabel: "New leads",
                bLabel: "Calls logged",
              }))}
            />
          </div>
        </section>

        <section className="panel p-5">
          <p className="eyebrow">Funnel · Stage groups</p>
          <h2 className="mt-1 text-lg font-semibold text-navy">Pipeline depth</h2>
          <div className="mt-4">
            <BarChart
              data={data.funnelGroups.map((g) => ({ name: g.name, value: g.count }))}
              height={180}
            />
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="panel p-5">
          <p className="eyebrow">Sources</p>
          <h2 className="mt-1 text-lg font-semibold text-navy">Where leads came from</h2>
          <div className="mt-4">
            <DonutChart
              data={data.sourceMix.slice(0, 8).map((s) => ({ name: s.name, value: s.count }))}
              size={140}
            />
          </div>
        </section>

        <section className="panel p-5">
          <p className="eyebrow">Programmes</p>
          <h2 className="mt-1 text-lg font-semibold text-navy">Course mix</h2>
          <div className="mt-4">
            <DonutChart
              data={data.courseMix.map((s) => ({ name: s.name, value: s.count }))}
              size={140}
            />
          </div>
        </section>

        <section className="panel p-5">
          <p className="eyebrow">Outcomes</p>
          <h2 className="mt-1 text-lg font-semibold text-navy">Won vs lost</h2>
          <div className="mt-4">
            <DonutChart
              data={[
                { name: "Closed won", value: kpis.won, color: "#059669" },
                { name: "Closed lost", value: kpis.lost, color: "#DC2626" },
                {
                  name: "Still open",
                  value: kpis.openLeads,
                  color: "#4F46E5",
                },
              ].filter((d) => d.value > 0)}
              size={140}
            />
          </div>
        </section>
      </div>

      {/* ── Stage detail + counselor board ── */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <p className="eyebrow">Stages · Full breakdown</p>
          <h2 className="mt-1 text-lg font-semibold text-navy">Every stage count</h2>
          <div className="mt-4 max-h-80 overflow-y-auto pr-1">
            <HBarList
              data={data.stageBreakdown.map((s) => ({ name: s.name, value: s.count }))}
            />
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <p className="eyebrow">Counselors · Performance</p>
            <h2 className="mt-1 text-lg font-semibold text-navy">Leaderboard</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-navy/[0.02]">
                <tr>
                  <th className="eyebrow px-4 py-2">Counselor</th>
                  <th className="eyebrow px-4 py-2">Total</th>
                  <th className="eyebrow px-4 py-2">Open</th>
                  <th className="eyebrow px-4 py-2">Won</th>
                  <th className="eyebrow px-4 py-2">Attention</th>
                  <th className="eyebrow px-4 py-2">Win %</th>
                </tr>
              </thead>
              <tbody>
                {data.counselorBoard.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 font-medium text-navy">{c.name}</td>
                    <td className="px-4 py-2.5 text-muted">{c.total}</td>
                    <td className="px-4 py-2.5 text-muted">{c.open}</td>
                    <td className="px-4 py-2.5 text-muted">{c.won}</td>
                    <td className="px-4 py-2.5 text-muted">{c.attention}</td>
                    <td className="px-4 py-2.5 font-semibold text-periwinkle">
                      {c.winRate.toFixed(0)}%
                    </td>
                  </tr>
                ))}
                {data.counselorBoard.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-muted">
                      No counselors yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border px-5 py-3">
            <BarChart
              data={data.counselorBoard.map((c) => ({ name: c.name, value: c.total }))}
              height={100}
            />
          </div>
        </section>
      </div>

      {/* ── Fees + loans ── */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <p className="eyebrow">Fees</p>
          <h2 className="mt-1 text-lg font-semibold text-navy">Collection health</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border px-3 py-3">
              <p className="text-[10px] uppercase tracking-eyebrow text-muted">Collected</p>
              <p className="mt-1 text-lg font-semibold text-navy">
                {formatCurrency(kpis.feeCollected)}
              </p>
            </div>
            <div className="rounded-xl border border-border px-3 py-3">
              <p className="text-[10px] uppercase tracking-eyebrow text-muted">Outstanding</p>
              <p className="mt-1 text-lg font-semibold text-navy">
                {formatCurrency(kpis.feeOutstanding)}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-eyebrow text-muted">
              Payment mode mix
            </p>
            <DonutChart
              data={data.paymentModeMix.map((p) => ({ name: p.name, value: p.count }))}
              size={120}
            />
          </div>
        </section>

        <section className="panel p-5">
          <p className="eyebrow">Loans</p>
          <h2 className="mt-1 text-lg font-semibold text-navy">Vendor approval rates</h2>
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
                  <td className="py-2 font-medium text-navy">{v.name}</td>
                  <td className="py-2 text-muted">{v.sent}</td>
                  <td className="py-2 text-muted">{v.approved}</td>
                  <td className="py-2 font-semibold text-periwinkle">{v.rate}%</td>
                </tr>
              ))}
              {data.vendorLoanStats.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-muted">
                    No loan vendors / applications yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <div className="mt-4">
            <BarChart
              data={data.vendorLoanStats.map((v) => ({ name: v.name, value: v.sent }))}
              height={100}
            />
          </div>
        </section>
      </div>

      {/* ── Live queues ── */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="panel p-5">
          <p className="eyebrow">Today</p>
          <h2 className="mt-1 text-lg font-semibold text-navy">Interviews</h2>
          <ul className="mt-4 space-y-2">
            {data.interviewsToday.length === 0 ? (
              <li className="text-sm text-muted">None scheduled today.</li>
            ) : (
              data.interviewsToday.map((iv) => (
                <li
                  key={iv.id}
                  className="rounded-xl border border-border px-3 py-2 text-sm"
                >
                  <p className="font-medium text-navy">{iv.leadName}</p>
                  <p className="text-xs text-muted">
                    {iv.round} · {formatDateTime(iv.scheduled_at)}
                  </p>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="panel p-5">
          <p className="eyebrow">Queue</p>
          <h2 className="mt-1 text-lg font-semibold text-navy">Needs attention</h2>
          <ul className="mt-4 space-y-2">
            {data.attentionList.length === 0 ? (
              <li className="text-sm text-muted">All clear.</li>
            ) : (
              data.attentionList.map((l) => (
                <Link
                  key={l.id}
                  href={`/leads/${l.id}`}
                  className="flex items-center justify-between rounded-xl border border-border px-3 py-2 hover:bg-navy/[0.02]"
                >
                  <span className="text-sm font-medium text-navy">{l.name}</span>
                  <span className="text-xs text-muted">
                    {STAGE_LABELS[l.stage as Stage] ?? l.stage}
                  </span>
                </Link>
              ))
            )}
          </ul>
        </section>

        <section className="panel p-5">
          <p className="eyebrow">Fresh</p>
          <h2 className="mt-1 text-lg font-semibold text-navy">Latest leads</h2>
          <ul className="mt-4 space-y-2">
            {data.recentLeads.map((l) => (
              <Link
                key={l.id}
                href={`/leads/${l.id}`}
                className="block rounded-xl border border-border px-3 py-2 hover:bg-navy/[0.02]"
              >
                <p className="truncate text-sm font-medium text-navy">{l.name}</p>
                <p className="truncate text-xs text-muted">
                  {STAGE_LABELS[l.stage as Stage] ?? l.stage}
                  {l.counselor ? ` · ${l.counselor}` : " · Unassigned"}
                </p>
              </Link>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
