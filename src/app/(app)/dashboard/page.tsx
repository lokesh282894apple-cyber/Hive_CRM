import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard, EmptyState } from "@/components/ui/Primitives";
import { OPEN_STAGES, STAGE_LABELS, type Stage } from "@/lib/constants";
import { fetchCounselorAttributionGlance } from "@/lib/marketing/queries";
import Link from "next/link";
import { formatDateTime } from "@/lib/utils";

export default async function CounselorDashboardPage() {
  const user = await requireUser(["counselor", "admin"]);
  const supabase = createClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const isCounselor = user.role === "counselor";
  const attentionStages = [
    "dnp",
    "no_show",
    "reschedule",
    "r1_no_show",
    "r2_no_show",
    "r3_no_show",
  ];
  const newStages = ["new_lead", "lead_created"];

  let openCountQ = supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .in("stage", OPEN_STAGES);
  let newCountQ = supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .in("stage", newStages);
  let attentionCountQ = supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .in("stage", attentionStages);
  let attentionListQ = supabase
    .from("leads")
    .select("id, name, stage")
    .in("stage", attentionStages)
    .order("updated_at", { ascending: false })
    .limit(8);
  let myLeadIdsQ = supabase.from("leads").select("id");

  if (isCounselor) {
    openCountQ = openCountQ.eq("lead_allocated_to", user.id);
    newCountQ = newCountQ.eq("lead_allocated_to", user.id);
    attentionCountQ = attentionCountQ.eq("lead_allocated_to", user.id);
    attentionListQ = attentionListQ.eq("lead_allocated_to", user.id);
    myLeadIdsQ = myLeadIdsQ.eq("lead_allocated_to", user.id);
  }

  let interviewsQ = supabase
    .from("interview_bookings")
    .select(
      "id, scheduled_at, round, meet_link, lead_id, leads!inner(id, name, lead_allocated_to)"
    )
    .gte("scheduled_at", today.toISOString())
    .lt("scheduled_at", tomorrow.toISOString())
    .order("scheduled_at", { ascending: true });

  if (isCounselor) {
    interviewsQ = interviewsQ.eq("leads.lead_allocated_to", user.id);
  }

  const [
    { count: openCount },
    { count: newCount },
    { count: attentionCount },
    { data: attentionList },
    { data: interviews },
    { data: myLeads },
  ] = await Promise.all([
    openCountQ,
    newCountQ,
    attentionCountQ,
    attentionListQ,
    interviewsQ,
    myLeadIdsQ.limit(2000),
  ]);

  const glance = await fetchCounselorAttributionGlance(
    supabase,
    (myLeads ?? []).map((l) => l.id)
  );

  return (
    <div>
      <PageHeader
        eyebrow="Counselor workspace"
        title="Today's"
        accent="Focus"
        description="Interviews on your book, leads that need a touch, and marketing provenance when forms include session_id."
        actions={
          <Link href="/leads/new" className="btn-primary">
            Add Lead
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="My open leads" value={openCount ?? 0} />
        <StatCard label="New / unworked" value={newCount ?? 0} />
        <StatCard
          label="Needs attention"
          value={attentionCount ?? 0}
          hint="DNP / no-show / reschedule"
        />
        <StatCard
          label="Attributed (marketing)"
          value={glance.attributedCount}
          hint={
            glance.totalLeads
              ? `${Math.round((glance.attributedCount / glance.totalLeads) * 100)}% of my leads`
              : "Form + session_id handoff"
          }
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <p className="eyebrow">Today · Interviews</p>
          <h2 className="mt-1 text-lg font-semibold text-navy">Scheduled today</h2>
          <div className="mt-4 space-y-3">
            {(interviews ?? []).length === 0 ? (
              <p className="text-sm text-muted">No interviews scheduled for today.</p>
            ) : (
              (interviews ?? []).map((iv) => {
                const lead = iv.leads as unknown as { name: string } | null;
                return (
                  <div
                    key={iv.id}
                    className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-medium text-navy">{lead?.name ?? "Lead"}</p>
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
                );
              })
            )}
          </div>
        </section>

        <section className="panel p-5">
          <p className="eyebrow">Queue</p>
          <h2 className="mt-1 text-lg font-semibold text-navy">Leads needing attention</h2>
          <div className="mt-4 space-y-2">
            {(attentionList ?? []).length === 0 ? (
              <p className="text-sm text-muted">Nothing flagged right now.</p>
            ) : (
              (attentionList ?? []).map((l) => (
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
          <p className="eyebrow">Marketing · Source mix</p>
          <h2 className="mt-1 text-lg font-semibold text-navy">Where my leads came from</h2>
          <ul className="mt-4 space-y-2">
            {glance.topSources.length === 0 ? (
              <li className="text-sm text-muted">
                No attributed leads yet. Website forms must send session_id into the CRM webhook.
              </li>
            ) : (
              glance.topSources.map((s) => (
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
          <p className="eyebrow">Marketing · Recent handoffs</p>
          <h2 className="mt-1 text-lg font-semibold text-navy">Open in Marketing Box</h2>
          <ul className="mt-4 space-y-2">
            {glance.recent.length === 0 ? (
              <li className="text-sm text-muted">No recent attributed conversions.</li>
            ) : (
              glance.recent.map((r) => (
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

      {(openCount ?? 0) === 0 ? (
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
