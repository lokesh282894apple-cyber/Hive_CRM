import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard, EmptyState } from "@/components/ui/Primitives";
import { OPEN_STAGES, STAGE_LABELS, type Stage } from "@/lib/constants";
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

  if (isCounselor) {
    openCountQ = openCountQ.eq("lead_allocated_to", user.id);
    newCountQ = newCountQ.eq("lead_allocated_to", user.id);
    attentionCountQ = attentionCountQ.eq("lead_allocated_to", user.id);
    attentionListQ = attentionListQ.eq("lead_allocated_to", user.id);
  }

  // Today's interviews: only for leads allocated to this counselor (admins see all)
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
  ] = await Promise.all([
    openCountQ,
    newCountQ,
    attentionCountQ,
    attentionListQ,
    interviewsQ,
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="Counselor workspace"
        title="Today's"
        accent="Focus"
        description="Interviews on your book, leads that need a touch, and scoped pipeline stats."
        actions={
          <Link href="/leads/new" className="btn-primary">
            Add Lead
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="My open leads" value={openCount ?? 0} />
        <StatCard label="New / unworked" value={newCount ?? 0} />
        <StatCard
          label="Needs attention"
          value={attentionCount ?? 0}
          hint="DNP / no-show / reschedule"
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
                      <p className="text-sm font-medium text-navy">
                        {lead?.name ?? "Lead"}
                      </p>
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
