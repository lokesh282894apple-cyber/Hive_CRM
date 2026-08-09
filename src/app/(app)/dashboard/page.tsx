import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard, EmptyState } from "@/components/ui/Primitives";
import { fetchAdmissionsAnalytics } from "@/lib/analytics/admissions";
import { fetchCounselorAttributionGlance } from "@/lib/marketing/queries";
import { BarChart, DonutChart, DualTrend, HBarList } from "@/components/charts/SimpleCharts";
import { STAGE_LABELS, type Stage } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import Link from "next/link";

export default async function CounselorDashboardPage({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  const user = await requireUser(["counselor", "admin"]);
  const supabase = createClient();
  const isCounselor = user.role === "counselor";
  const rangeDays = ["7", "30", "90"].includes(searchParams.range ?? "")
    ? Number(searchParams.range)
    : 30;

  const data = await fetchAdmissionsAnalytics(supabase, {
    counselorId: isCounselor ? user.id : null,
    rangeDays,
  });
  const { kpis } = data;

  let myLeadIds: string[] = [];
  if (isCounselor) {
    const { data: mine } = await supabase
      .from("leads")
      .select("id")
      .eq("lead_allocated_to", user.id)
      .limit(3000);
    myLeadIds = (mine ?? []).map((l) => l.id);
  } else {
    const { data: all } = await supabase.from("leads").select("id").limit(3000);
    myLeadIds = (all ?? []).map((l) => l.id);
  }
  const attribution = await fetchCounselorAttributionGlance(supabase, myLeadIds);

  const ranges = [7, 30, 90];
  const basePath = "/dashboard";

  return (
    <div>
      <PageHeader
        eyebrow={isCounselor ? "Counselor workspace" : "Admissions · Counselor view"}
        title="Today's"
        accent="Focus"
        description="Your book: interviews, attention queue, personal funnel depth, and marketing provenance."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/leads/new" className="btn-primary">
              Add Lead
            </Link>
            <Link href="/leads" className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-navy">
              My leads
            </Link>
            <Link href="/attention" className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-navy">
              Attention
            </Link>
            <div className="flex gap-1 rounded-xl border border-border p-1">
              {ranges.map((r) => (
                <Link
                  key={r}
                  href={`${basePath}?range=${r}`}
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

      <section className="panel mb-6 p-5">
        <p className="eyebrow">Summary</p>
        <p className="mt-2 text-sm text-navy">
          <strong>{kpis.openLeads}</strong> open · <strong>{kpis.newLeads}</strong> new ·{" "}
          <strong>{kpis.attentionLeads}</strong> need a touch ·{" "}
          <strong>{kpis.interviewsToday}</strong> interviews today ·{" "}
          <strong>{attribution.attributedCount}</strong> with marketing journey ·{" "}
          <strong>{kpis.callsInRange}</strong> calls in last {rangeDays}d.
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="My open leads" value={kpis.openLeads} />
        <StatCard label="New / unworked" value={kpis.newLeads} />
        <StatCard label="Needs attention" value={kpis.attentionLeads} hint="DNP / no-show" />
        <StatCard label="Won" value={kpis.won} />
        <StatCard
          label="Attributed"
          value={attribution.attributedCount}
          hint={
            attribution.totalLeads
              ? `${Math.round((attribution.attributedCount / attribution.totalLeads) * 100)}% of book`
              : "Marketing Box"
          }
        />
        <StatCard label="Calls (range)" value={kpis.callsInRange} hint={`${rangeDays}d`} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <p className="eyebrow">Today · Interviews</p>
          <h2 className="mt-1 text-lg font-semibold text-navy">Scheduled today</h2>
          <div className="mt-4 space-y-3">
            {data.interviewsToday.length === 0 ? (
              <p className="text-sm text-muted">No interviews scheduled for today.</p>
            ) : (
              data.interviewsToday.map((iv) => (
                <div
                  key={iv.id}
                  className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium text-navy">{iv.leadName}</p>
                    <p className="text-xs text-muted">
                      {iv.round} · {formatDateTime(iv.scheduled_at)}
                    </p>
                  </div>
                  {iv.meet_link ? (
                    <a
                      href={iv.meet_link}
                      className="text-sm font-medium text-periwinkle hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Meet
                    </a>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>

        <section className="panel p-5">
          <p className="eyebrow">Queue</p>
          <h2 className="mt-1 text-lg font-semibold text-navy">Leads needing attention</h2>
          <div className="mt-4 space-y-2">
            {data.attentionList.length === 0 ? (
              <p className="text-sm text-muted">Nothing flagged right now.</p>
            ) : (
              data.attentionList.map((l) => (
                <Link
                  key={l.id}
                  href={`/leads/${l.id}`}
                  className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 hover:bg-navy/[0.02]"
                >
                  <span className="text-sm font-medium text-navy">{l.name}</span>
                  <span className="text-xs text-muted">
                    {STAGE_LABELS[l.stage as Stage]}
                  </span>
                </Link>
              ))
            )}
          </div>
          <Link
            href="/attention"
            className="mt-4 inline-block text-sm font-medium text-periwinkle hover:underline"
          >
            Open attention board →
          </Link>
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <p className="eyebrow">My funnel</p>
          <h2 className="mt-1 text-lg font-semibold text-navy">Stage groups</h2>
          <div className="mt-4">
            <BarChart
              data={data.funnelGroups.map((g) => ({ name: g.name, value: g.count }))}
              height={160}
            />
          </div>
        </section>

        <section className="panel p-5">
          <p className="eyebrow">Activity · {rangeDays}d</p>
          <h2 className="mt-1 text-lg font-semibold text-navy">New leads vs my calls</h2>
          <div className="mt-4">
            <DualTrend
              series={data.daily.map((d) => ({
                date: d.date,
                a: d.leads,
                b: d.calls,
                aLabel: "Leads created",
                bLabel: "Calls",
              }))}
            />
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="panel p-5">
          <p className="eyebrow">Sources</p>
          <h2 className="mt-1 text-lg font-semibold text-navy">My lead origins</h2>
          <div className="mt-4">
            <DonutChart
              data={data.sourceMix.slice(0, 8).map((s) => ({ name: s.name, value: s.count }))}
              size={130}
            />
          </div>
        </section>

        <section className="panel p-5">
          <p className="eyebrow">Programmes</p>
          <h2 className="mt-1 text-lg font-semibold text-navy">Course mix</h2>
          <div className="mt-4">
            <HBarList
              data={data.courseMix.map((c) => ({ name: c.name, value: c.count }))}
            />
          </div>
        </section>

        <section className="panel p-5">
          <p className="eyebrow">Stages</p>
          <h2 className="mt-1 text-lg font-semibold text-navy">Where my book sits</h2>
          <div className="mt-4 max-h-64 overflow-y-auto">
            <HBarList
              data={data.stageBreakdown.slice(0, 12).map((s) => ({
                name: s.name,
                value: s.count,
              }))}
            />
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <p className="eyebrow">Marketing · Source mix</p>
          <h2 className="mt-1 text-lg font-semibold text-navy">Campaign handoffs</h2>
          <ul className="mt-4 space-y-2">
            {attribution.topSources.length === 0 ? (
              <li className="text-sm text-muted">
                No attributed leads yet. Website forms must send session_id.
              </li>
            ) : (
              attribution.topSources.map((s) => (
                <li
                  key={s.name}
                  className="flex items-center justify-between rounded-xl border border-border px-3 py-2"
                >
                  <span className="truncate text-sm font-medium text-navy">{s.name}</span>
                  <span className="text-sm font-semibold text-periwinkle">{s.count}</span>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="panel p-5">
          <p className="eyebrow">Marketing · Recent</p>
          <h2 className="mt-1 text-lg font-semibold text-navy">Open in Marketing Box</h2>
          <ul className="mt-4 space-y-2">
            {attribution.recent.length === 0 ? (
              <li className="text-sm text-muted">No recent attributed conversions.</li>
            ) : (
              attribution.recent.map((r) => (
                <Link
                  key={r.lead_id}
                  href={`/leads/${r.lead_id}?tab=marketing`}
                  className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 hover:bg-navy/[0.02]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-navy">{r.name}</p>
                    <p className="truncate text-xs text-muted">{r.campaign ?? "Unattributed"}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted">
                    {new Date(r.converted_at).toLocaleDateString("en-IN")}
                  </span>
                </Link>
              ))
            )}
          </ul>
        </section>
      </div>

      <section className="panel mt-6 p-5">
        <p className="eyebrow">Fresh in my book</p>
        <h2 className="mt-1 text-lg font-semibold text-navy">Latest leads</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.recentLeads.map((l) => (
            <Link
              key={l.id}
              href={`/leads/${l.id}`}
              className="rounded-xl border border-border px-3 py-2.5 hover:bg-navy/[0.02]"
            >
              <p className="truncate text-sm font-medium text-navy">{l.name}</p>
              <p className="truncate text-xs text-muted">
                {STAGE_LABELS[l.stage as Stage] ?? l.stage}
                {l.source ? ` · ${l.source}` : ""}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {kpis.totalLeads === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No leads allocated yet"
            description="Add a lead manually or wait for website form submissions."
          />
        </div>
      ) : null}
    </div>
  );
}
