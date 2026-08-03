import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard } from "@/components/ui/Primitives";
import { STAGE_LABELS, type Stage } from "@/lib/constants";

export default async function AdminDashboardPage() {
  await requireUser(["admin"]);
  const supabase = createClient();

  const [{ data: leads }, { data: cohorts }, { data: counselors }] = await Promise.all([
    supabase.from("leads").select("id, stage, lead_allocated_to, cohort_id, created_at"),
    supabase
      .from("cohorts")
      .select("id, name, start_date, default_total_fee, active, courses(name)")
      .order("start_date", { ascending: false }),
    supabase.from("users").select("id, name").eq("role", "counselor").eq("active", true),
  ]);

  const all = leads ?? [];
  const funnelGroups: { label: string; stages: Stage[] }[] = [
    { label: "Pre-R1", stages: ["lead_created", "in_funnel", "new_lead", "dnp", "no_show", "reschedule"] },
    { label: "R1", stages: ["r1_booked", "r1_confirmed", "r1_reject", "r1_no_show", "r1_reschedule"] },
    { label: "R2", stages: ["r2_booked", "r2_tbb", "r2_reject", "r2_no_show", "r2_reschedule"] },
    { label: "R3", stages: ["r3_booked", "r3_tbb", "r3_no_show", "r3_reschedule"] },
    { label: "Offer", stages: ["yet_to_offer", "offered"] },
    { label: "Closed Won", stages: ["closed_won"] },
    { label: "Closed Lost", stages: ["closed_lost"] },
  ];

  const leaderboard = (counselors ?? [])
    .map((c) => ({
      name: c.name,
      count: all.filter((l) => l.lead_allocated_to === c.id).length,
      won: all.filter((l) => l.lead_allocated_to === c.id && l.stage === "closed_won").length,
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <div>
      <PageHeader
        eyebrow="Admin · Overview"
        title="Admissions"
        accent="Dashboard"
        description="Funnel counts, cohort health, and counselor leaderboard."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total leads" value={all.length} />
        <StatCard
          label="Closed won"
          value={all.filter((l) => l.stage === "closed_won").length}
        />
        <StatCard
          label="In interview rounds"
          value={all.filter((l) => /r[123]_/.test(l.stage)).length}
        />
        <StatCard label="Active cohorts" value={(cohorts ?? []).filter((c) => c.active).length} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <p className="eyebrow">Funnel · Stage groups</p>
          <ul className="mt-4 space-y-2">
            {funnelGroups.map((g) => {
              const count = all.filter((l) => g.stages.includes(l.stage as Stage)).length;
              return (
                <li key={g.label} className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                  <span className="text-sm font-medium text-navy">{g.label}</span>
                  <span className="text-sm font-semibold text-periwinkle">{count}</span>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 max-h-48 overflow-y-auto text-xs text-muted">
            {Object.entries(
              all.reduce<Record<string, number>>((acc, l) => {
                acc[l.stage] = (acc[l.stage] ?? 0) + 1;
                return acc;
              }, {})
            ).map(([stage, n]) => (
              <div key={stage} className="flex justify-between py-0.5">
                <span>{STAGE_LABELS[stage as Stage] ?? stage}</span>
                <span>{n}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel p-5">
          <p className="eyebrow">Counselor · Leaderboard</p>
          <ul className="mt-4 space-y-2">
            {leaderboard.map((row) => (
              <li key={row.name} className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                <span className="text-sm font-medium text-navy">{row.name}</span>
                <span className="text-xs text-muted">
                  {row.count} leads · {row.won} won
                </span>
              </li>
            ))}
            {leaderboard.length === 0 ? (
              <li className="text-sm text-muted">No counselors yet.</li>
            ) : null}
          </ul>
        </section>
      </div>

      <section className="panel mt-6 overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <p className="eyebrow">Cohorts</p>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-navy/[0.02]">
            <tr>
              <th className="eyebrow px-4 py-3">Cohort</th>
              <th className="eyebrow px-4 py-3">Course</th>
              <th className="eyebrow px-4 py-3">Start</th>
              <th className="eyebrow px-4 py-3">Default fee</th>
              <th className="eyebrow px-4 py-3">Leads</th>
            </tr>
          </thead>
          <tbody>
            {(cohorts ?? []).map((c) => {
              const course = c.courses as unknown as { name: string } | null;
              return (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-navy">{c.name}</td>
                  <td className="px-4 py-3 text-muted">{course?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{c.start_date ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">₹{Number(c.default_total_fee).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-muted">
                    {all.filter((l) => l.cohort_id === c.id).length}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
