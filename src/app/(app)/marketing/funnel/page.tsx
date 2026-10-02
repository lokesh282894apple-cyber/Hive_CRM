import { Fragment } from "react";
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
import { addCounts, emptyFunnelCounts, type SplitCount } from "@/lib/analytics/funnel-engine";

// Cold aggregates can take several seconds on a small DB — finish and fill
// the cache instead of hitting the default function timeout.
export const maxDuration = 60;

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

  const basis = filters.basis ?? "event";
  const total = recompute([rolled.reduce((acc, r) => {
    mergeRow(acc, r);
    return acc;
  }, emptyRow("Total"))])[0];
  const totals = {
    sessions: total.sessions,
    organicSpend: total.organicSpend,
    inorganicSpend: total.inorganicSpend,
    spend: total.totalSpend,
    leads: total.leads,
    organicLeads: total.organicLeads,
    inorganicLeads: total.inorganicLeads,
    r1: total.r1Booked,
    r1Org: total.r1BookedOrganic,
    r1Inorg: total.r1BookedInorganic,
    r1Done: total.r1Completed,
  };

  const hrefWith = (patch: Record<string, string | null>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (v) sp.set(k, v);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) sp.delete(k);
      else sp.set(k, v);
    }
    const q = sp.toString();
    return `/marketing/funnel${q ? `?${q}` : ""}`;
  };
  const pill = (active: boolean) =>
    `rounded-lg px-3 py-1.5 ${active ? "bg-navy text-white" : "bg-navy/5 text-navy"}`;

  return (
    <MarketingPageShell
      title="Lead funnel"
      description="Daily / weekly / monthly — sessions → leads → R1 → R2 → R3 → offer → convert · spend · activity log"
      basePath="/marketing/funnel"
      section="leads"
      extra={
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex gap-2">
            {(["daily", "weekly", "monthly"] as const).map((g) => (
              <Link key={g} href={hrefWith({ group: g === "daily" ? null : g })} className={`${pill(group === g)} capitalize`}>
                {g}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Count R1 / R2 / R3 / offer / convert by</span>
            <Link href={hrefWith({ basis: null })} className={pill(basis === "event")}>
              Date it happened
            </Link>
            <Link href={hrefWith({ basis: "cohort" })} className={pill(basis === "cohort")}>
              Lead created date (cohort)
            </Link>
          </div>
        </div>
      }
    >
      {basis === "cohort" ? (
        <p className="rounded-xl border border-border bg-navy/[0.02] px-4 py-2 text-xs text-muted">
          Cohort view: every R1 / R2 / R3 / offer / convert is counted on the day its lead was created, so each
          row shows how that day&apos;s leads have progressed so far. Recent rows keep growing as leads move on.
        </p>
      ) : null}
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
                <th className="eyebrow px-3 py-2">Paid sessions</th>
                <th className="eyebrow px-3 py-2">Organic sessions</th>
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
                  <td className="px-3 py-2 tabular-nums">{r.sessionsPaid ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{r.sessionsOrganic ?? "—"}</td>
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
                <td className="px-3 py-2">{total.sessionsPaid ?? "—"}</td>
                <td className="px-3 py-2">{total.sessionsOrganic ?? "—"}</td>
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
                <th className="eyebrow px-3 py-2">Paid / Org sessions</th>
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
                  <td className="px-3 py-2 text-muted">
                    {r.sessionsPaid ?? "—"} / {r.sessionsOrganic ?? "—"}
                  </td>
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
                <td className="px-3 py-2">
                  {total.sessionsPaid ?? "—"} / {total.sessionsOrganic ?? "—"}
                </td>
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

      <details className="panel" open>
        <summary className="cursor-pointer border-b border-border px-4 py-3 text-sm font-semibold text-navy">
          Cost metrics — cost per R2, R3, offer &amp; convert
        </summary>
        <p className="px-4 pt-3 text-xs text-muted">
          Blended = total spend ÷ all · Org = organic spend ÷ organic leads&apos; count · InOrg = inorganic spend ÷
          paid leads&apos; count. R2 / R3 = booked. &quot;—&quot; means nothing reached that stage.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-left text-sm">
            <thead className="border-b border-border bg-navy/[0.02]">
              <tr>
                <th className="eyebrow px-3 py-2" rowSpan={2}>Period</th>
                {COST_STAGES.map((c) => (
                  <th key={c.key} className="eyebrow border-l border-border px-3 py-2 text-center" colSpan={4}>
                    {c.label}
                  </th>
                ))}
              </tr>
              <tr>
                {COST_STAGES.map((c) => (
                  <Fragment key={c.key}>
                    <th className="eyebrow border-l border-border px-3 py-1">#</th>
                    <th className="eyebrow px-3 py-1">Blended</th>
                    <th className="eyebrow px-3 py-1">Org</th>
                    <th className="eyebrow px-3 py-1">InOrg</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...rolled, total].map((r) => (
                <tr
                  key={`cost4-${r.date}`}
                  className={
                    r === total
                      ? "border-t border-border bg-navy/[0.03] font-semibold"
                      : "border-b border-border last:border-0"
                  }
                >
                  <td className="px-3 py-2 font-medium">{r.date}</td>
                  {COST_STAGES.map((c) => {
                    const n: SplitCount = r.funnel[c.key];
                    return (
                      <Fragment key={c.key}>
                        <td className="border-l border-border px-3 py-2 tabular-nums">
                          {n.total}
                          <span className="text-[11px] text-muted"> ({n.org}/{n.inorg})</span>
                        </td>
                        <td className="px-3 py-2">{formatInr(costPer(r.totalSpend, n.total))}</td>
                        <td className="px-3 py-2">{formatInr(costPer(r.organicSpend, n.org))}</td>
                        <td className="px-3 py-2">{formatInr(costPer(r.inorganicSpend, n.inorg))}</td>
                      </Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </MarketingPageShell>
  );
}

const COST_STAGES = [
  { key: "r2Booked", label: "R2" },
  { key: "r3Booked", label: "R3" },
  { key: "offer", label: "Offer" },
  { key: "convert", label: "Convert / Acquisition" },
] as const;

function costPer(spend: number, n: number): number | null {
  return n > 0 ? spend / n : null;
}

function rollWeekly(rows: FunnelDayRow[]) {
  const map = new Map<string, FunnelDayRow>();
  for (const r of rows) {
    // r.date is a YYYY-MM-DD key — pure calendar math (Monday start)
    const d = new Date(`${r.date}T00:00:00.000Z`);
    const day = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - day + (day === 0 ? -6 : 1));
    const mon = d.toISOString().slice(0, 10);
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
    sessionsPaid: null,
    sessionsOrganic: null,
    funnel: emptyFunnelCounts(),
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
  if (r.sessionsPaid != null) cur.sessionsPaid = (cur.sessionsPaid ?? 0) + r.sessionsPaid;
  if (r.sessionsOrganic != null) cur.sessionsOrganic = (cur.sessionsOrganic ?? 0) + r.sessionsOrganic;
  addCounts(cur.funnel, r.funnel);
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
