import { requireAuth } from "@/lib/auth";
import { PageHeader, EmptyState } from "@/components/ui/Primitives";
import { fetchCounselorHome } from "@/lib/analytics/counselor-home";
import { DualTrend, HBarList } from "@/components/charts/SimpleCharts";
import { STAGE_LABELS, type Stage } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import { viewAsHref } from "@/lib/impersonation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

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

export default async function CounselorDashboardPage({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  const ctx = await requireAuth(["counselor", "admin"]);
  const user = ctx.user;
  const isCounselor = user.role === "counselor" || ctx.impersonating;
  const rangeDays = ["7", "30", "90"].includes(searchParams.range ?? "")
    ? Number(searchParams.range)
    : 30;

  const [data, reinquiries] = await Promise.all([
    fetchCounselorHome(isCounselor ? user.id : null, rangeDays),
    loadReinquiries(isCounselor ? user.id : null),
  ]);
  const { kpis, attribution } = data;
  const ranges = [7, 30, 90];
  const vid = ctx.impersonating ? user.id : null;
  const h = (path: string) => viewAsHref(vid, path);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={isCounselor ? "Counselor" : "Admissions · Counselor view"}
        title="Today's"
        accent="Focus"
        description="Work queues first, then your funnel and sources."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={h("/leads/new")} className="btn-primary">
              Add Lead
            </Link>
            <Link
              href={h("/leads")}
              className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-navy"
            >
              My leads
            </Link>
            <div className="flex gap-1 rounded-xl border border-border p-1">
              {ranges.map((r) => (
                <Link
                  key={r}
                  href={h(`/dashboard?range=${r}`)}
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

      <section className="panel p-5 sm:p-6">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Open leads" value={kpis.openLeads} hint={`${kpis.newLeads} new / unworked`} />
          <Metric label="Needs attention" value={kpis.attentionLeads} hint="DNP / no-show" />
          <Metric label="Won" value={kpis.won} hint={`${kpis.winRate.toFixed(0)}% of closed`} />
          <Metric
            label="Calls"
            value={kpis.callsInRange}
            hint={`Last ${rangeDays}d · ${attribution.attributedCount} attributed`}
          />
        </div>
      </section>

      {reinquiries.length ? (
        <Section
          title={`Re-inquiries · ${reinquiries.length}`}
          action={
            <Link href={h("/leads/tasks")} className="text-xs font-medium text-periwinkle hover:underline">
              Tasks →
            </Link>
          }
        >
          <p className="mb-3 text-xs text-muted">
            Leads already in your pipeline that filled a form again — call them back. Mark the task done once called.
          </p>
          <ul className="space-y-2">
            {reinquiries.map((r) => (
              <Link
                key={r.id}
                href={h(`/leads/${r.leadId}`)}
                className="flex items-center justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-navy">{r.leadName}</span>
                  <span className="block truncate text-xs text-muted">{r.title.replace(/^Re-inquiry:\s*/, "")}</span>
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {STAGE_LABELS[r.stage as Stage] ?? r.stage} · {formatDateTime(r.createdAt)}
                </span>
              </Link>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Work first */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Interviews today">
          {data.interviewsToday.length === 0 ? (
            <p className="text-sm text-muted">No interviews scheduled for today.</p>
          ) : (
            <ul className="space-y-3">
              {data.interviewsToday.map((iv) => (
                <li key={iv.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-navy">{iv.leadName}</p>
                    <p className="text-xs text-muted">
                      {iv.round} · {formatDateTime(iv.scheduled_at)}
                    </p>
                  </div>
                  {iv.meet_link ? (
                    <a
                      href={iv.meet_link}
                      className="shrink-0 text-sm font-medium text-periwinkle hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Meet
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Needs attention"
          action={
            <Link href="/attention" className="text-xs font-medium text-periwinkle hover:underline">
              Board →
            </Link>
          }
        >
          {data.attentionList.length === 0 ? (
            <p className="text-sm text-muted">Nothing flagged right now.</p>
          ) : (
            <ul className="space-y-2">
              {data.attentionList.map((l) => (
                <Link
                  key={l.id}
                  href={h(`/leads/${l.id}`)}
                  className="flex items-center justify-between gap-2 py-1 text-sm"
                >
                  <span className="truncate font-medium text-navy">{l.name}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {STAGE_LABELS[l.stage as Stage]}
                  </span>
                </Link>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* Analytics — quieter */}
      <div className="grid gap-6 lg:grid-cols-5">
        <Section title={`Activity · ${rangeDays}d`} className="lg:col-span-3">
          <DualTrend
            height={150}
            series={data.daily.map((d) => ({
              date: d.date,
              a: d.leads,
              b: d.calls,
              aLabel: "Leads created",
              bLabel: "Calls",
            }))}
          />
        </Section>
        <Section title="My funnel" className="lg:col-span-2">
          <HBarList
            data={data.funnelGroups.map((g) => ({ name: g.name, value: g.count }))}
          />
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Sources">
          <HBarList
            data={data.sourceMix.slice(0, 8).map((s) => ({ name: s.name, value: s.count }))}
          />
        </Section>
        <Section title="Where my book sits">
          <HBarList
            data={data.stageBreakdown.slice(0, 8).map((s) => ({
              name: s.name,
              value: s.count,
            }))}
          />
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Marketing handoffs">
          {attribution.topSources.length === 0 ? (
            <p className="text-sm text-muted">No attributed leads yet.</p>
          ) : (
            <ul className="space-y-2">
              {attribution.topSources.map((s) => (
                <li key={s.name} className="flex items-center justify-between text-sm">
                  <span className="truncate font-medium text-navy">{s.name}</span>
                  <span className="font-semibold text-periwinkle">{s.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Latest in my book"
          action={
            <Link href="/leads" className="text-xs font-medium text-periwinkle hover:underline">
              All →
            </Link>
          }
        >
          {data.recentLeads.length === 0 ? (
            <p className="text-sm text-muted">No leads yet.</p>
          ) : (
            <ul className="space-y-2">
              {data.recentLeads.slice(0, 6).map((l) => (
                <Link key={l.id} href={h(`/leads/${l.id}`)} className="block py-1">
                  <p className="truncate text-sm font-medium text-navy">{l.name}</p>
                  <p className="truncate text-xs text-muted">
                    {STAGE_LABELS[l.stage as Stage] ?? l.stage}
                    {l.source ? ` · ${l.source}` : ""}
                  </p>
                </Link>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {kpis.totalLeads === 0 ? (
        <EmptyState
          title="No leads allocated yet"
          description="Add a lead manually or wait for website form submissions."
        />
      ) : null}
    </div>
  );
}

/** Open "Re-inquiry" tasks (made when a pipeline lead fills a form again). */
async function loadReinquiries(ownerId: string | null) {
  const db = createAdminClient();
  let q = db
    .from("lead_tasks")
    .select("id, title, created_at, lead:leads!inner(id, name, stage, lead_allocated_to)")
    .eq("status", "open")
    .ilike("title", "Re-inquiry%")
    .order("created_at", { ascending: false })
    .limit(30);
  if (ownerId) q = q.eq("lead.lead_allocated_to", ownerId);
  const { data } = await q;
  return (data ?? []).map((r) => {
    const lead = (Array.isArray(r.lead) ? r.lead[0] : r.lead) as { id: string; name: string; stage: string };
    return { id: r.id as string, title: r.title as string, createdAt: r.created_at as string, leadId: lead.id, leadName: lead.name, stage: lead.stage };
  });
}
