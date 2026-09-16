import { requireUser } from "@/lib/auth";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { DailyNotesEditor } from "@/components/marketing/DailyNotesEditor";
import { ActivityLogEditor } from "@/components/marketing/ActivityLogEditor";
import { StatCard } from "@/components/ui/Primitives";
import {
  fetchLeadFunnel,
  formatInr,
  formatPct,
  parseMarketingFilters,
  type FunnelDayRow,
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
      organicSpend: a.organicSpend + r.organicSpend,
      inorganicSpend: a.inorganicSpend + r.inorganicSpend,
      spend: a.spend + r.totalSpend,
      leads: a.leads + r.leads,
      organicLeads: a.organicLeads + r.organicLeads,
      inorganicLeads: a.inorganicLeads + r.inorganicLeads,
      r1: a.r1 + r.r1Booked,
      r1Org: a.r1Org + r.r1BookedOrganic,
      r1Inorg: a.r1Inorg + r.r1BookedInorganic,
      r1Done: a.r1Done + r.r1Completed,
    }),
    {
      sessions: 0,
      organicSpend: 0,
      inorganicSpend: 0,
      spend: 0,
      leads: 0,
      organicLeads: 0,
      inorganicLeads: 0,
      r1: 0,
      r1Org: 0,
      r1Inorg: 0,
      r1Done: 0,
    }
  );

  return (
    <MarketingPageShell
      title="Lead funnel"
      description="Daily / weekly / monthly — sessions → leads → R1 · spend · activity log"
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
        <StatCard label="R1 booked" value={String(totals.r1)} />
        <StatCard label="R1 completed" value={String(totals.r1Done)} />
        <StatCard
          label="Blended CPL"
          value={formatInr(totals.leads ? totals.spend / totals.leads : null)}
        />
      </div>

      <details className="panel open:pb-0" open>
        <summary className="cursor-pointer border-b border-border px-4 py-3 text-sm font-semibold text-navy">
          Input metrics — sessions & spend
        </summary>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-border bg-navy/[0.02]">
              <tr>
                <th className="eyebrow px-3 py-2">Period</th>
                <th className="eyebrow px-3 py-2">Sessions</th>
                <th className="eyebrow px-3 py-2">Leads</th>
                <th className="eyebrow px-3 py-2">Organic spend</th>
                <th className="eyebrow px-3 py-2">Inorganic spend</th>
                <th className="eyebrow px-3 py-2">Total spend</th>
                <th className="eyebrow px-3 py-2">Activity log</th>
                <th className="eyebrow px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rolled.map((r) => (
                <tr key={`in-${r.date}`} className="border-b border-border last:border-0 align-top">
                  <td className="px-3 py-2 font-medium">{r.date}</td>
                  <td className="px-3 py-2 tabular-nums">{r.sessions}</td>
                  <td className="px-3 py-2 tabular-nums">{r.leads}</td>
                  <td className="px-3 py-2">{formatInr(r.organicSpend)}</td>
                  <td className="px-3 py-2">{formatInr(r.inorganicSpend)}</td>
                  <td className="px-3 py-2">{formatInr(r.totalSpend)}</td>
                  <td className="px-3 py-2">
                    {group === "daily" ? (
                      <ActivityLogEditor
                        date={r.date}
                        activityLog={r.activityLog}
                        notes={r.notes}
                        organicSpend={r.organicSpend || null}
                        inorganicSpend={r.inorganicSpend || null}
                        items={r.activityItems}
                      />
                    ) : (
                      <ul className="space-y-0.5 text-[11px] text-navy">
                        {r.activityItems.length ? (
                          r.activityItems.map((a) => (
                            <li key={a.id}>
                              {a.activity}
                              {a.status ? ` · ${a.status}` : ""}
                              {a.attributedLeads
                                ? ` · ${a.attributedLeads} leads`
                                : ""}
                            </li>
                          ))
                        ) : (
                          <li className="text-muted">—</li>
                        )}
                      </ul>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {group === "daily" ? (
                      <DailyNotesEditor
                        date={r.date}
                        notes={r.notes}
                        organicSpend={r.organicSpend || null}
                        inorganicSpend={r.inorganicSpend || null}
                      />
                    ) : (
                      <span className="text-xs text-muted">{r.notes || "—"}</span>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-border bg-navy/[0.03] font-semibold">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2">{totals.sessions}</td>
                <td className="px-3 py-2">{totals.leads}</td>
                <td className="px-3 py-2">{formatInr(totals.organicSpend)}</td>
                <td className="px-3 py-2">{formatInr(totals.inorganicSpend)}</td>
                <td className="px-3 py-2">{formatInr(totals.spend)}</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
              </tr>
            </tbody>
          </table>
        </div>
      </details>

      <details className="panel" open>
        <summary className="cursor-pointer border-b border-border px-4 py-3 text-sm font-semibold text-navy">
          Output metrics — leads & R1
        </summary>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-border bg-navy/[0.02]">
              <tr>
                <th className="eyebrow px-3 py-2">Period</th>
                <th className="eyebrow px-3 py-2">Sessions</th>
                <th className="eyebrow px-3 py-2">Leads</th>
                <th className="eyebrow px-3 py-2">Org / Inorg</th>
                <th className="eyebrow px-3 py-2">R1 booked</th>
                <th className="eyebrow px-3 py-2">R1 org / inorg</th>
                <th className="eyebrow px-3 py-2">R1 done</th>
                <th className="eyebrow px-3 py-2">S→L %</th>
                <th className="eyebrow px-3 py-2">R1÷L %</th>
                <th className="eyebrow px-3 py-2">R1÷L org</th>
                <th className="eyebrow px-3 py-2">R1÷L inorg</th>
              </tr>
            </thead>
            <tbody>
              {rolled.map((r) => (
                <tr key={`out-${r.date}`} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium">{r.date}</td>
                  <td className="px-3 py-2">{r.sessions}</td>
                  <td className="px-3 py-2">{r.leads}</td>
                  <td className="px-3 py-2 text-muted">
                    {r.organicLeads} / {r.inorganicLeads}
                  </td>
                  <td className="px-3 py-2">{r.r1Booked}</td>
                  <td className="px-3 py-2 text-muted">
                    {r.r1BookedOrganic} / {r.r1BookedInorganic}
                  </td>
                  <td className="px-3 py-2">{r.r1Completed}</td>
                  <td className="px-3 py-2">{formatPct(r.sessionsToLeadsPct)}</td>
                  <td className="px-3 py-2">{formatPct(r.r1ToLeadPct)}</td>
                  <td className="px-3 py-2">{formatPct(r.r1ToLeadOrganicPct)}</td>
                  <td className="px-3 py-2">{formatPct(r.r1ToLeadInorganicPct)}</td>
                </tr>
              ))}
              <tr className="border-t border-border bg-navy/[0.03] font-semibold">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2">{totals.sessions}</td>
                <td className="px-3 py-2">{totals.leads}</td>
                <td className="px-3 py-2">
                  {totals.organicLeads} / {totals.inorganicLeads}
                </td>
                <td className="px-3 py-2">{totals.r1}</td>
                <td className="px-3 py-2">
                  {totals.r1Org} / {totals.r1Inorg}
                </td>
                <td className="px-3 py-2">{totals.r1Done}</td>
                <td className="px-3 py-2">
                  {formatPct(totals.sessions ? (totals.leads / totals.sessions) * 100 : null)}
                </td>
                <td className="px-3 py-2">
                  {formatPct(totals.leads ? (totals.r1 / totals.leads) * 100 : null)}
                </td>
                <td className="px-3 py-2">
                  {formatPct(
                    totals.organicLeads ? (totals.r1Org / totals.organicLeads) * 100 : null
                  )}
                </td>
                <td className="px-3 py-2">
                  {formatPct(
                    totals.inorganicLeads
                      ? (totals.r1Inorg / totals.inorganicLeads) * 100
                      : null
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>

      <details className="panel">
        <summary className="cursor-pointer border-b border-border px-4 py-3 text-sm font-semibold text-navy">
          Cost metrics — CPL & cost per R1
        </summary>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-border bg-navy/[0.02]">
              <tr>
                <th className="eyebrow px-3 py-2">Period</th>
                <th className="eyebrow px-3 py-2">Total spend</th>
                <th className="eyebrow px-3 py-2">CPL blended</th>
                <th className="eyebrow px-3 py-2">CPL organic</th>
                <th className="eyebrow px-3 py-2">CPL inorganic</th>
                <th className="eyebrow px-3 py-2">Cost / R1</th>
                <th className="eyebrow px-3 py-2">Cost / R1 org</th>
                <th className="eyebrow px-3 py-2">Cost / R1 inorg</th>
              </tr>
            </thead>
            <tbody>
              {rolled.map((r) => (
                <tr key={`cost-${r.date}`} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium">{r.date}</td>
                  <td className="px-3 py-2">{formatInr(r.totalSpend)}</td>
                  <td className="px-3 py-2">{formatInr(r.blendedCpl)}</td>
                  <td className="px-3 py-2">{formatInr(r.organicCpl)}</td>
                  <td className="px-3 py-2">{formatInr(r.inorganicCpl)}</td>
                  <td className="px-3 py-2">{formatInr(r.costPerR1)}</td>
                  <td className="px-3 py-2">{formatInr(r.organicCostPerR1)}</td>
                  <td className="px-3 py-2">{formatInr(r.inorganicCostPerR1)}</td>
                </tr>
              ))}
              <tr className="border-t border-border bg-navy/[0.03] font-semibold">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2">{formatInr(totals.spend)}</td>
                <td className="px-3 py-2">
                  {formatInr(totals.leads ? totals.spend / totals.leads : null)}
                </td>
                <td className="px-3 py-2">
                  {formatInr(
                    totals.organicLeads ? totals.organicSpend / totals.organicLeads : null
                  )}
                </td>
                <td className="px-3 py-2">
                  {formatInr(
                    totals.inorganicLeads
                      ? totals.inorganicSpend / totals.inorganicLeads
                      : null
                  )}
                </td>
                <td className="px-3 py-2">
                  {formatInr(totals.r1 ? totals.spend / totals.r1 : null)}
                </td>
                <td className="px-3 py-2">
                  {formatInr(totals.r1Org ? totals.organicSpend / totals.r1Org : null)}
                </td>
                <td className="px-3 py-2">
                  {formatInr(
                    totals.r1Inorg ? totals.inorganicSpend / totals.r1Inorg : null
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </MarketingPageShell>
  );
}

function rollWeekly(rows: FunnelDayRow[]) {
  const map = new Map<string, FunnelDayRow>();
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

function rollMonthly(rows: FunnelDayRow[]) {
  const map = new Map<string, FunnelDayRow>();
  for (const r of rows) {
    const m = r.date.slice(0, 7);
    const cur = map.get(m) ?? emptyRow(m);
    mergeRow(cur, r);
    map.set(m, cur);
  }
  return recompute(Array.from(map.values()));
}

function emptyRow(date: string): FunnelDayRow {
  return {
    date,
    sessions: 0,
    metaSpend: 0,
    nonMetaSpend: 0,
    organicSpend: 0,
    inorganicSpend: 0,
    totalSpend: 0,
    leads: 0,
    organicLeads: 0,
    inorganicLeads: 0,
    aqlOrganic: 0,
    aqlInorganic: 0,
    aqlTotal: 0,
    r1Booked: 0,
    r1BookedOrganic: 0,
    r1BookedInorganic: 0,
    r1Completed: 0,
    sessionsToLeadsPct: null,
    r1ToLeadPct: null,
    r1ToLeadOrganicPct: null,
    r1ToLeadInorganicPct: null,
    blendedCpl: null,
    organicCpl: null,
    inorganicCpl: null,
    blendedCpaql: null,
    costPerR1: null,
    organicCostPerR1: null,
    inorganicCostPerR1: null,
    notes: "",
    activityLog: "",
    activityItems: [],
    doneActivations: [],
  };
}

function mergeRow(cur: FunnelDayRow, r: FunnelDayRow) {
  cur.sessions += r.sessions;
  cur.metaSpend += r.metaSpend;
  cur.nonMetaSpend += r.nonMetaSpend;
  cur.organicSpend += r.organicSpend;
  cur.inorganicSpend += r.inorganicSpend;
  cur.totalSpend += r.totalSpend;
  cur.leads += r.leads;
  cur.organicLeads += r.organicLeads;
  cur.inorganicLeads += r.inorganicLeads;
  cur.aqlTotal += r.aqlTotal;
  cur.r1Booked += r.r1Booked;
  cur.r1BookedOrganic += r.r1BookedOrganic;
  cur.r1BookedInorganic += r.r1BookedInorganic;
  cur.r1Completed += r.r1Completed;
  if (r.notes) cur.notes = cur.notes ? `${cur.notes} · ${r.notes}` : r.notes;
  if (r.activityLog) {
    cur.activityLog = cur.activityLog
      ? `${cur.activityLog}\n${r.activityLog}`
      : r.activityLog;
  }
  cur.activityItems.push(...r.activityItems);
  cur.doneActivations.push(...r.doneActivations);
}

function recompute(rows: FunnelDayRow[]) {
  return rows
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({
      ...row,
      sessionsToLeadsPct: row.sessions ? (row.leads / row.sessions) * 100 : null,
      r1ToLeadPct: row.leads ? (row.r1Booked / row.leads) * 100 : null,
      r1ToLeadOrganicPct: row.organicLeads
        ? (row.r1BookedOrganic / row.organicLeads) * 100
        : null,
      r1ToLeadInorganicPct: row.inorganicLeads
        ? (row.r1BookedInorganic / row.inorganicLeads) * 100
        : null,
      blendedCpl: row.leads ? row.totalSpend / row.leads : null,
      organicCpl: row.organicLeads ? row.organicSpend / row.organicLeads : null,
      inorganicCpl: row.inorganicLeads
        ? row.inorganicSpend / row.inorganicLeads
        : null,
      blendedCpaql: row.r1Booked ? row.totalSpend / row.r1Booked : null,
      costPerR1: row.r1Booked ? row.totalSpend / row.r1Booked : null,
      organicCostPerR1: row.r1BookedOrganic
        ? row.organicSpend / row.r1BookedOrganic
        : null,
      inorganicCostPerR1: row.r1BookedInorganic
        ? row.inorganicSpend / row.r1BookedInorganic
        : null,
    }));
}
