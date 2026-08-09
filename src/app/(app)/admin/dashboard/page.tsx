import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Primitives";
import { fetchAdmissionsAnalytics } from "@/lib/analytics/admissions";
import { DonutChart, DualTrend, HBarList } from "@/components/charts/SimpleCharts";
import { STAGE_LABELS, type Stage } from "@/lib/constants";
import { formatCurrency, formatDateTime } from "@/lib/utils";
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
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin"
        title="Admissions"
        accent="Overview"
        description={`Command view for the last ${rangeDays} days — summary first, then funnel, team, and money.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/analytics"
              className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-navy"
            >
              Deep analytics
            </Link>
            <Link
              href="/admin/leads"
              className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-navy"
            >
              All leads
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

      {/* Summary — one calm strip, not a wall of cards */}
      <section className="panel p-5 sm:p-6">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Open pipeline" value={kpis.openLeads} hint={`${kpis.totalLeads} total`} />
          <Metric label="Win rate" value={`${kpis.winRate.toFixed(0)}%`} hint={`${kpis.won} won · ${kpis.lost} lost`} />
          <Metric label="Needs attention" value={kpis.attentionLeads} hint="DNP / no-show" />
          <Metric label="Unassigned" value={kpis.unassigned} />
          <Metric
            label="Fee collected"
            value={formatCurrency(kpis.feeCollected)}
            hint={`${formatCurrency(kpis.feeOutstanding)} outstanding`}
          />
        </div>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-4 text-xs text-muted">
          <span>
            New / unworked <strong className="text-navy">{kpis.newLeads}</strong>
          </span>
          <span>
            Calls ({rangeDays}d) <strong className="text-navy">{kpis.callsInRange}</strong>
          </span>
          <span>
            Interviews today <strong className="text-navy">{kpis.interviewsToday}</strong>
          </span>
          <span>
            Web sessions <strong className="text-navy">{kpis.sessionsInRange}</strong>
          </span>
          <span>
            Form → CRM <strong className="text-navy">{kpis.formConversionsInRange}</strong>
          </span>
          <span>
            Marketing-attributed <strong className="text-navy">{kpis.attributed}</strong>
          </span>
        </div>
      </section>

      {/* Pipeline */}
      <div className="grid gap-6 lg:grid-cols-5">
        <Section title={`Activity · ${rangeDays}d`} className="lg:col-span-3">
          <DualTrend
            height={160}
            series={data.daily.map((d) => ({
              date: d.date,
              a: d.leads,
              b: d.calls,
              aLabel: "New leads",
              bLabel: "Calls",
            }))}
          />
        </Section>
        <Section title="Pipeline depth" className="lg:col-span-2">
          <HBarList
            data={data.funnelGroups.map((g) => ({ name: g.name, value: g.count }))}
          />
        </Section>
      </div>

      {/* Mix — bars over three competing pies */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Lead sources">
          <HBarList
            data={data.sourceMix.slice(0, 6).map((s) => ({ name: s.name, value: s.count }))}
          />
        </Section>
        <Section title="Programmes">
          <HBarList
            data={data.courseMix.slice(0, 6).map((s) => ({ name: s.name, value: s.count }))}
          />
        </Section>
        <Section title="Outcomes">
          <DonutChart
            size={120}
            data={[
              { name: "Won", value: kpis.won, color: "#059669" },
              { name: "Lost", value: kpis.lost, color: "#DC2626" },
              { name: "Open", value: kpis.openLeads, color: "#4F46E5" },
            ].filter((d) => d.value > 0)}
          />
        </Section>
      </div>

      {/* Team */}
      <Section
        title="Counselor leaderboard"
        action={
          <Link href="/admin/analytics" className="text-xs font-medium text-periwinkle hover:underline">
            Full stages →
          </Link>
        }
      >
        <div className="-mx-5 -mb-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-navy/[0.02]">
              <tr>
                <th className="eyebrow px-5 py-2.5">Counselor</th>
                <th className="eyebrow px-4 py-2.5">Total</th>
                <th className="eyebrow px-4 py-2.5">Open</th>
                <th className="eyebrow px-4 py-2.5">Won</th>
                <th className="eyebrow px-4 py-2.5">Attention</th>
                <th className="eyebrow px-5 py-2.5">Win %</th>
              </tr>
            </thead>
            <tbody>
              {data.counselorBoard.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-muted">
                    No counselors yet.
                  </td>
                </tr>
              ) : (
                data.counselorBoard.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 font-medium text-navy">{c.name}</td>
                    <td className="px-4 py-3 text-muted">{c.total}</td>
                    <td className="px-4 py-3 text-muted">{c.open}</td>
                    <td className="px-4 py-3 text-muted">{c.won}</td>
                    <td className="px-4 py-3 text-muted">{c.attention}</td>
                    <td className="px-5 py-3 font-semibold text-periwinkle">
                      {c.winRate.toFixed(0)}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Money */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Fee collection">
          <div className="mb-5 grid grid-cols-2 gap-4">
            <Metric label="Collected" value={formatCurrency(kpis.feeCollected)} />
            <Metric label="Outstanding" value={formatCurrency(kpis.feeOutstanding)} />
          </div>
          {data.paymentModeMix.length > 0 ? (
            <HBarList
              data={data.paymentModeMix.map((p) => ({ name: p.name, value: p.count }))}
            />
          ) : (
            <p className="text-sm text-muted">No fee payments recorded yet.</p>
          )}
        </Section>
        <Section title="Loan vendors">
          {data.vendorLoanStats.length === 0 ? (
            <p className="text-sm text-muted">No loan applications yet.</p>
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

      {/* Live queues */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Interviews today">
          <ul className="space-y-2.5">
            {data.interviewsToday.length === 0 ? (
              <li className="text-sm text-muted">None scheduled.</li>
            ) : (
              data.interviewsToday.map((iv) => (
                <li key={iv.id} className="text-sm">
                  <p className="font-medium text-navy">{iv.leadName}</p>
                  <p className="text-xs text-muted">
                    {iv.round} · {formatDateTime(iv.scheduled_at)}
                  </p>
                </li>
              ))
            )}
          </ul>
        </Section>

        <Section
          title="Needs attention"
          action={
            <Link href="/attention" className="text-xs font-medium text-periwinkle hover:underline">
              Board →
            </Link>
          }
        >
          <ul className="space-y-2">
            {data.attentionList.length === 0 ? (
              <li className="text-sm text-muted">All clear.</li>
            ) : (
              data.attentionList.map((l) => (
                <Link
                  key={l.id}
                  href={`/leads/${l.id}`}
                  className="flex items-center justify-between gap-2 py-1 text-sm hover:text-periwinkle"
                >
                  <span className="truncate font-medium text-navy">{l.name}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {STAGE_LABELS[l.stage as Stage] ?? l.stage}
                  </span>
                </Link>
              ))
            )}
          </ul>
        </Section>

        <Section
          title="Latest leads"
          action={
            <Link href="/admin/leads" className="text-xs font-medium text-periwinkle hover:underline">
              All →
            </Link>
          }
        >
          <ul className="space-y-2">
            {data.recentLeads.map((l) => (
              <Link
                key={l.id}
                href={`/leads/${l.id}`}
                className="block py-1 hover:opacity-80"
              >
                <p className="truncate text-sm font-medium text-navy">{l.name}</p>
                <p className="truncate text-xs text-muted">
                  {STAGE_LABELS[l.stage as Stage] ?? l.stage}
                  {l.counselor ? ` · ${l.counselor}` : " · Unassigned"}
                </p>
              </Link>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
