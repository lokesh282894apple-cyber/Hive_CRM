import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard } from "@/components/ui/Primitives";
import { RangeTabs } from "@/components/marketing/RangeTabs";
import { fetchMarketingOverview, parseRange, type RangeKey } from "@/lib/marketing/queries";

function Table({
  title,
  rows,
}: {
  title: string;
  rows: { name: string; sessions: number; attributed: number }[];
}) {
  const totalSess = rows.reduce((s, r) => s + r.sessions, 0);
  const totalAttr = rows.reduce((s, r) => s + r.attributed, 0);
  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-border px-5 py-3">
        <p className="eyebrow">{title}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="border-b border-border bg-navy/[0.02]">
            <tr>
              <th className="eyebrow px-4 py-2">Name</th>
              <th className="eyebrow px-4 py-2">Sessions</th>
              <th className="eyebrow px-4 py-2">Share</th>
              <th className="eyebrow px-4 py-2">Forms</th>
              <th className="eyebrow px-4 py-2">Conv %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-b border-border last:border-0">
                <td className="max-w-[280px] truncate px-4 py-2.5 font-medium text-navy">
                  {r.name}
                </td>
                <td className="px-4 py-2.5 text-muted">{r.sessions}</td>
                <td className="px-4 py-2.5 text-muted">
                  {totalSess > 0 ? `${((r.sessions / totalSess) * 100).toFixed(1)}%` : "—"}
                </td>
                <td className="px-4 py-2.5 text-muted">{r.attributed}</td>
                <td className="px-4 py-2.5 font-medium text-navy">
                  {r.sessions > 0 ? `${((r.attributed / r.sessions) * 100).toFixed(1)}%` : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-sm text-muted">
                  No data in this range.
                </td>
              </tr>
            ) : (
              <tr className="bg-navy/[0.02] font-semibold">
                <td className="px-4 py-2.5 text-navy">Total</td>
                <td className="px-4 py-2.5">{totalSess}</td>
                <td className="px-4 py-2.5">100%</td>
                <td className="px-4 py-2.5">{totalAttr}</td>
                <td className="px-4 py-2.5">
                  {totalSess > 0 ? `${((totalAttr / totalSess) * 100).toFixed(1)}%` : "—"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function MarketingPerformancePage({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  await requireUser(["admin", "marketing"]);
  const range = parseRange(searchParams.range) as RangeKey;
  const supabase = createClient();
  const overview = await fetchMarketingOverview(supabase, range);

  return (
    <div>
      <PageHeader
        eyebrow="Marketing · Analytics"
        title="Channel"
        accent="Performance"
        description={`Sessions and form conversions by channel, campaign, and UTM — last ${range} days.`}
        actions={<RangeTabs basePath="/marketing/performance" range={range} />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Sessions" value={overview.kpis.sessions} />
        <StatCard label="Form conversions" value={overview.kpis.attributed} />
        <StatCard
          label="Overall conv %"
          value={`${overview.kpis.conversionRate.toFixed(1)}%`}
        />
      </div>

      <div className="mt-6 space-y-6">
        <Table title="By channel" rows={overview.byChannel} />
        <Table title="By campaign" rows={overview.byCampaign} />
        <Table
          title="By UTM (source / medium / campaign)"
          rows={overview.byUtm.map((u) => ({
            name:
              [u.utm_source, u.utm_medium, u.utm_campaign].filter(Boolean).join(" / ") ||
              "—",
            sessions: u.sessions,
            attributed: u.attributed,
          }))}
        />
      </div>

      <section className="panel mt-6 p-5">
        <p className="eyebrow">Device mix</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {overview.devices.map((d) => (
            <div
              key={d.device}
              className="rounded-xl border border-border px-4 py-3 text-sm"
            >
              <p className="capitalize text-muted">{d.device}</p>
              <p className="mt-1 text-xl font-semibold text-navy">{d.count}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
