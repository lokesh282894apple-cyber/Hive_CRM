import { requireUser } from "@/lib/auth";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { StatCard } from "@/components/ui/Primitives";
import {
  fetchDailyCallTracker,
  formatPct,
  parseMarketingFilters,
} from "@/lib/marketing/dashboard-queries";

export default async function MarketingCallsPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  await requireUser(["admin", "marketing"]);
  const filters = parseMarketingFilters(searchParams);
  const rows = await fetchDailyCallTracker(filters);

  const totals = rows.reduce(
    (a, r) => ({
      leads: a.leads + r.newLeads,
      day1: a.day1 + r.day1Attempts,
      day2: a.day2 + r.day2Attempts,
      day3: a.day3 + r.day3Attempts,
      calledDay1: a.calledDay1 + r.leadsCalledDay1,
      r1: a.r1 + r.r1Booked,
    }),
    { leads: 0, day1: 0, day2: 0, day3: 0, calledDay1: 0, r1: 0 }
  );

  return (
    <MarketingPageShell
      title="Daily call tracker"
      description="Day 1 / 2 / 3 call attempts vs new leads & R1 booked (counsellor outreach)"
      basePath="/marketing/calls"
      section="leads"
      showOrganic={false}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="New leads" value={String(totals.leads)} />
        <StatCard
          label="Day 1 coverage"
          value={formatPct(totals.leads ? (totals.calledDay1 / totals.leads) * 100 : null)}
          hint="Leads with a same-day call"
        />
        <StatCard label="Total Day 1–3 attempts" value={String(totals.day1 + totals.day2 + totals.day3)} />
        <StatCard label="R1 booked" value={String(totals.r1)} />
      </div>

      <section className="panel overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="border-b border-border bg-navy/[0.02]">
            <tr>
              <th className="eyebrow px-3 py-2">Date</th>
              <th className="eyebrow px-3 py-2">New leads</th>
              <th className="eyebrow px-3 py-2">Day 1 attempts</th>
              <th className="eyebrow px-3 py-2">Day 2 attempts</th>
              <th className="eyebrow px-3 py-2">Day 3 attempts</th>
              <th className="eyebrow px-3 py-2">Day 1 coverage</th>
              <th className="eyebrow px-3 py-2">Any call</th>
              <th className="eyebrow px-3 py-2">R1 booked</th>
              <th className="eyebrow px-3 py-2">Lead → R1 %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.date} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-medium">{r.date}</td>
                <td className="px-3 py-2">{r.newLeads}</td>
                <td className="px-3 py-2">{r.day1Attempts}</td>
                <td className="px-3 py-2">{r.day2Attempts}</td>
                <td className="px-3 py-2">{r.day3Attempts}</td>
                <td className="px-3 py-2">{formatPct(r.day1CoveragePct)}</td>
                <td className="px-3 py-2">{r.leadsWithAnyCall}</td>
                <td className="px-3 py-2">{r.r1Booked}</td>
                <td className="px-3 py-2">{formatPct(r.r1Pct)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-muted">
                  No leads in this date range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </MarketingPageShell>
  );
}
