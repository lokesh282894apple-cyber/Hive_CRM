import { requireUser } from "@/lib/auth";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { StatCard } from "@/components/ui/Primitives";
import {
  fetchLeadFunnel,
  formatInr,
  formatPct,
  parseMarketingFilters,
} from "@/lib/marketing/dashboard-queries";
import Link from "next/link";

export default async function MarketingFunnelPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  await requireUser(["admin", "marketing"]);
  const filters = parseMarketingFilters(searchParams);
  const group = searchParams.group ?? "daily";
  const rows = await fetchLeadFunnel(filters);

  const rolled =
    group === "weekly"
      ? rollWeekly(rows)
      : group === "monthly"
        ? rollMonthly(rows)
        : rows;

  const totals = rolled.reduce(
    (a, r) => ({
      sessions: a.sessions + r.sessions,
      spend: a.spend + r.totalSpend,
      leads: a.leads + r.leads,
      aql: a.aql + r.aqlTotal,
      r1: a.r1 + r.r1Booked,
    }),
    { sessions: 0, spend: 0, leads: 0, aql: 0, r1: 0 }
  );

  return (
    <MarketingPageShell
      title="Lead funnel"
      description="Daily / weekly / monthly — spend → leads → AQL → R1 (Prabhu sheet)"
      basePath="/marketing/funnel"
      section="leads"
      extra={
        <div className="flex gap-2 text-sm">
          {(["daily", "weekly", "monthly"] as const).map((g) => (
            <Link
              key={g}
              href={`/marketing/funnel?group=${g}`}
              className={`rounded-lg px-3 py-1.5 capitalize ${group === g ? "bg-navy text-white" : "bg-navy/5 text-navy"}`}
            >
              {g}
            </Link>
          ))}
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Sessions" value={String(totals.sessions)} />
        <StatCard label="Leads" value={String(totals.leads)} />
        <StatCard label="AQL" value={String(totals.aql)} hint="Acceptance Quality Limit" />
        <StatCard label="R1 booked" value={String(totals.r1)} />
        <StatCard label="Blended CPL" value={formatInr(totals.leads ? totals.spend / totals.leads : null)} />
      </div>

      <section className="panel overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-border bg-navy/[0.02]">
            <tr>
              <th className="eyebrow px-3 py-2">Period</th>
              <th className="eyebrow px-3 py-2">Sessions</th>
              <th className="eyebrow px-3 py-2">Spend</th>
              <th className="eyebrow px-3 py-2">Leads</th>
              <th className="eyebrow px-3 py-2">Org / Inorg</th>
              <th className="eyebrow px-3 py-2">AQL</th>
              <th className="eyebrow px-3 py-2">R1 booked</th>
              <th className="eyebrow px-3 py-2">S→L %</th>
              <th className="eyebrow px-3 py-2">CPL</th>
              <th className="eyebrow px-3 py-2">CPAQL</th>
            </tr>
          </thead>
          <tbody>
            {rolled.map((r) => (
              <tr key={r.date} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-medium">{r.date}</td>
                <td className="px-3 py-2">{r.sessions}</td>
                <td className="px-3 py-2">{formatInr(r.totalSpend)}</td>
                <td className="px-3 py-2">{r.leads}</td>
                <td className="px-3 py-2 text-muted">{r.organicLeads} / {r.inorganicLeads}</td>
                <td className="px-3 py-2">{r.aqlTotal}</td>
                <td className="px-3 py-2">{r.r1Booked}</td>
                <td className="px-3 py-2">{formatPct(r.sessionsToLeadsPct)}</td>
                <td className="px-3 py-2">{formatInr(r.blendedCpl)}</td>
                <td className="px-3 py-2">{formatInr(r.blendedCpaql)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </MarketingPageShell>
  );
}

function rollWeekly(rows: import("@/lib/marketing/dashboard-queries").FunnelDayRow[]) {
  const map = new Map<string, import("@/lib/marketing/dashboard-queries").FunnelDayRow>();
  for (const r of rows) {
    const d = new Date(r.date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(d.setDate(diff)).toISOString().slice(0, 10);
    const cur = map.get(mon) ?? emptyRow(mon);
    mergeRow(cur, r);
    map.set(mon, cur);
  }
  return recompute(Array.from(map.values()));
}

function rollMonthly(rows: import("@/lib/marketing/dashboard-queries").FunnelDayRow[]) {
  const map = new Map<string, import("@/lib/marketing/dashboard-queries").FunnelDayRow>();
  for (const r of rows) {
    const m = r.date.slice(0, 7);
    const cur = map.get(m) ?? emptyRow(m);
    mergeRow(cur, r);
    map.set(m, cur);
  }
  return recompute(Array.from(map.values()));
}

function emptyRow(date: string) {
  return {
    date,
    sessions: 0,
    metaSpend: 0,
    nonMetaSpend: 0,
    totalSpend: 0,
    leads: 0,
    organicLeads: 0,
    inorganicLeads: 0,
    aqlOrganic: 0,
    aqlInorganic: 0,
    aqlTotal: 0,
    r1Booked: 0,
    r1Completed: 0,
    sessionsToLeadsPct: null,
    blendedCpl: null,
    blendedCpaql: null,
    costPerR1: null,
  };
}

function mergeRow(
  cur: import("@/lib/marketing/dashboard-queries").FunnelDayRow,
  r: import("@/lib/marketing/dashboard-queries").FunnelDayRow
) {
  cur.sessions += r.sessions;
  cur.metaSpend += r.metaSpend;
  cur.nonMetaSpend += r.nonMetaSpend;
  cur.totalSpend += r.totalSpend;
  cur.leads += r.leads;
  cur.organicLeads += r.organicLeads;
  cur.inorganicLeads += r.inorganicLeads;
  cur.aqlTotal += r.aqlTotal;
  cur.r1Booked += r.r1Booked;
  cur.r1Completed += r.r1Completed;
}

function recompute(rows: import("@/lib/marketing/dashboard-queries").FunnelDayRow[]) {
  return rows
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({
      ...row,
      sessionsToLeadsPct: row.sessions ? (row.leads / row.sessions) * 100 : null,
      blendedCpl: row.leads ? row.totalSpend / row.leads : null,
      blendedCpaql: row.aqlTotal ? row.totalSpend / row.aqlTotal : null,
      costPerR1: row.r1Booked ? row.totalSpend / row.r1Booked : null,
    }));
}
