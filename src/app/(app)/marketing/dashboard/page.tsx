import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  fetchMarketingOverview,
  fetchTopPages,
  parseRange,
  type RangeKey,
} from "@/lib/marketing/queries";
import { PageHeader, StatCard } from "@/components/ui/Primitives";
import Link from "next/link";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";

function ChecklistItem({
  done,
  title,
  detail,
}: {
  done: boolean;
  title: string;
  detail: string;
}) {
  return (
    <li className="flex gap-3 rounded-xl border border-border px-3 py-2">
      {done ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
      ) : (
        <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
      )}
      <div>
        <p className="text-sm font-medium text-navy">{title}</p>
        <p className="text-xs text-muted">{detail}</p>
      </div>
    </li>
  );
}

function PerfTable({
  title,
  rows,
}: {
  title: string;
  rows: { name: string; sessions: number; attributed: number }[];
}) {
  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-border px-5 py-3">
        <p className="eyebrow">{title}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">No data in this range.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-navy/[0.02]">
            <tr>
              <th className="eyebrow px-4 py-2">Name</th>
              <th className="eyebrow px-4 py-2">Sessions</th>
              <th className="eyebrow px-4 py-2">Forms</th>
              <th className="eyebrow px-4 py-2">Conv %</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 12).map((r) => (
              <tr key={r.name} className="border-b border-border last:border-0">
                <td className="max-w-[220px] truncate px-4 py-2 font-medium text-navy">
                  {r.name}
                </td>
                <td className="px-4 py-2 text-muted">{r.sessions}</td>
                <td className="px-4 py-2 text-muted">{r.attributed}</td>
                <td className="px-4 py-2 text-muted">
                  {r.sessions > 0 ? `${((r.attributed / r.sessions) * 100).toFixed(1)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default async function MarketingDashboardPage({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  await requireUser(["admin", "marketing"]);

  const range = parseRange(searchParams.range) as RangeKey;
  const supabase = createClient();
  const [overview, topPages, { count: creativeCount }, { count: connectionCount }] =
    await Promise.all([
      fetchMarketingOverview(supabase, range),
      fetchTopPages(supabase, range, 12),
      supabase.from("ad_creatives").select("*", { count: "exact", head: true }),
      supabase
        .from("ad_platform_connection_status")
        .select("*", { count: "exact", head: true })
        .eq("status", "connected"),
    ]);

  const { kpis, daily, byChannel, byCampaign, byUtm, devices, recentSessions, recentConversions } =
    overview;

  const maxDaily = Math.max(1, ...daily.map((d) => Math.max(d.sessions, d.conversions)));

  // Resolve conversion lead names
  const convLeadIds = recentConversions.map((c) => c.lead_id);
  const { data: convLeads } = convLeadIds.length
    ? await supabase.from("leads").select("id, name, stage").in("id", convLeadIds)
    : { data: [] as { id: string; name: string; stage: string }[] };
  const leadMap = new Map((convLeads ?? []).map((l) => [l.id, l]));

  const ranges: RangeKey[] = ["7", "30", "90"];

  return (
    <div>
      <PageHeader
        eyebrow="Marketing · Overview"
        title="Funnel"
        accent="Dashboard"
        description="Pre-form traffic and form handoffs into Admissions. Use Performance, Sessions, Pages, and Conversions for deeper cuts."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/marketing/performance" className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-navy">
              Performance
            </Link>
            <Link href="/marketing/sessions" className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-navy">
              Sessions
            </Link>
            <Link href="/marketing/conversions" className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-navy">
              Conversions
            </Link>
            <div className="flex gap-1 rounded-xl border border-border p-1">
              {ranges.map((r) => (
                <Link
                  key={r}
                  href={`/marketing/dashboard?range=${r}`}
                  className={
                    r === range
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Sessions" value={kpis.sessions} hint={`Last ${range} days`} />
        <StatCard label="Page events" value={kpis.events} />
        <StatCard
          label="Form conversions"
          value={kpis.attributed}
          hint="Attributed admissions leads"
        />
        <StatCard
          label="Conv rate"
          value={`${kpis.conversionRate.toFixed(1)}%`}
          hint="Attributed / sessions"
        />
        <StatCard
          label="Events / session"
          value={kpis.avgEventsPerSession.toFixed(1)}
        />
      </div>

      <section className="panel mt-6 p-5">
        <p className="eyebrow">Trend · Sessions vs form conversions</p>
        <div className="mt-4 flex h-36 items-end gap-0.5">
          {daily.map((d) => (
            <div key={d.date} className="group relative flex flex-1 flex-col items-center justify-end gap-0.5">
              <div
                className="w-full rounded-t bg-periwinkle/70"
                style={{ height: `${(d.sessions / maxDaily) * 100}%`, minHeight: d.sessions ? 2 : 0 }}
                title={`${d.date}: ${d.sessions} sessions`}
              />
              <div
                className="w-full rounded-t bg-gold"
                style={{
                  height: `${(d.conversions / maxDaily) * 100}%`,
                  minHeight: d.conversions ? 2 : 0,
                }}
                title={`${d.date}: ${d.conversions} conversions`}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-4 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-periwinkle/70" /> Sessions
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-gold" /> Form conversions
          </span>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <PerfTable title="By channel" rows={byChannel} />
        <PerfTable title="By campaign" rows={byCampaign} />
        <PerfTable
          title="By UTM"
          rows={byUtm.map((u) => ({
            name: [u.utm_source, u.utm_medium, u.utm_campaign].filter(Boolean).join(" / ") || "—",
            sessions: u.sessions,
            attributed: u.attributed,
          }))}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <p className="eyebrow">Device split</p>
          <ul className="mt-4 space-y-2">
            {devices.map((d) => (
              <li
                key={d.device}
                className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm"
              >
                <span className="font-medium capitalize text-navy">{d.device}</span>
                <span className="text-periwinkle">{d.count}</span>
              </li>
            ))}
            {devices.length === 0 ? (
              <li className="text-sm text-muted">No sessions yet.</li>
            ) : null}
          </ul>
        </section>

        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <p className="eyebrow">Top pages</p>
            <Link href="/marketing/heatmaps" className="text-xs font-semibold text-periwinkle">
              Heatmaps →
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {topPages.map((p) => (
              <li key={p.page_url} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <Link
                  href={`/marketing/heatmaps?page=${encodeURIComponent(p.page_url)}`}
                  className="min-w-0 truncate text-sm text-navy hover:text-periwinkle"
                >
                  {p.page_url.replace(/^https?:\/\//, "")}
                </Link>
                <span className="shrink-0 text-xs text-muted">
                  {p.pageviews} pv · {p.clicks} clk
                </span>
              </li>
            ))}
            {topPages.length === 0 ? (
              <li className="px-5 py-6 text-sm text-muted">No page events in range.</li>
            ) : null}
          </ul>
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="panel overflow-hidden">
          <div className="border-b border-border px-5 py-3">
            <p className="eyebrow">Recent sessions</p>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-navy/[0.02]">
              <tr>
                <th className="eyebrow px-4 py-2">When</th>
                <th className="eyebrow px-4 py-2">Campaign</th>
                <th className="eyebrow px-4 py-2">Device</th>
                <th className="eyebrow px-4 py-2">Lead</th>
              </tr>
            </thead>
            <tbody>
              {recentSessions.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-xs text-muted">
                    {new Date(s.first_seen_at).toLocaleString("en-IN")}
                  </td>
                  <td className="max-w-[140px] truncate px-4 py-2 text-navy">
                    {s.campaign_name ?? s.utm_source ?? "—"}
                  </td>
                  <td className="px-4 py-2 capitalize text-muted">{s.device_type ?? "—"}</td>
                  <td className="px-4 py-2">
                    {s.lead_id ? (
                      <Link
                        href={`/leads/${s.lead_id}?tab=marketing`}
                        className="text-xs font-semibold text-periwinkle"
                      >
                        Open
                      </Link>
                    ) : (
                      <Link
                        href={`/marketing/sessions/${s.id}`}
                        className="text-xs font-semibold text-navy"
                      >
                        Session
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
              {recentSessions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-sm text-muted">
                    No sessions yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-border px-5 py-3">
            <p className="eyebrow">Recent form → admissions</p>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-navy/[0.02]">
              <tr>
                <th className="eyebrow px-4 py-2">Lead</th>
                <th className="eyebrow px-4 py-2">Campaign</th>
                <th className="eyebrow px-4 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {recentConversions.map((row) => {
                const lead = leadMap.get(row.lead_id);
                const camp = row.first_touch_campaign_id
                  ? overview.campaignMap.get(row.first_touch_campaign_id)
                  : null;
                return (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium text-navy">
                      <Link
                        className="hover:underline"
                        href={`/leads/${row.lead_id}?tab=marketing`}
                      >
                        {lead?.name ?? row.lead_id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted">{camp?.name ?? "Unattributed"}</td>
                    <td className="px-4 py-2 text-xs text-muted">
                      {new Date(row.converted_at).toLocaleString("en-IN")}
                    </td>
                  </tr>
                );
              })}
              {recentConversions.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-sm text-muted">
                    No form attributions yet. Website must send session_id + CRM_TRACK_API_KEY.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>

      <details className="panel mt-6 p-5">
        <summary className="cursor-pointer text-sm font-semibold text-navy">
          Setup checklist
        </summary>
        <ul className="mt-4 space-y-2">
          <ChecklistItem
            done={kpis.sessions > 0}
            title="Website tracking"
            detail="pageviews posting to /api/track/event"
          />
          <ChecklistItem
            done={(creativeCount ?? 0) > 0}
            title="Tracked /go creatives"
            detail="Optional influencer slugs on Campaigns"
          />
          <ChecklistItem
            done={kpis.attributed > 0}
            title="Form posts session_id"
            detail="Admissions proxy → /api/leads/website with Bearer key"
          />
          <ChecklistItem
            done={(connectionCount ?? 0) > 0}
            title="Ad platform connections"
            detail="Admin only — spend sync later"
          />
        </ul>
        <Link
          href="/marketing/campaigns"
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-periwinkle"
        >
          Campaigns <ArrowRight className="h-3 w-3" />
        </Link>
      </details>
    </div>
  );
}
