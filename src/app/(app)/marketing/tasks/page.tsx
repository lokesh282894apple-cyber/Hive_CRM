import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { StatCard } from "@/components/ui/Primitives";

export default async function MarketingTasksPage() {
  await requireUser(["admin", "marketing"]);
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: tasks } = await admin
    .from("marketing_tasks")
    .select("*")
    .order("due_date", { ascending: true })
    .limit(100);

  const open = (tasks ?? []).filter((t) => t.status !== "done").length;
  const overdue = (tasks ?? []).filter(
    (t) => t.status !== "done" && t.due_date && t.due_date < today
  ).length;

  return (
    <MarketingPageShell
      title="Marketing tasks"
      description="Ops task list linked to posts and metrics"
      basePath="/marketing/tasks"
      section="planning"
      showOrganic={false}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Open tasks" value={String(open)} />
        <StatCard label="Overdue" value={String(overdue)} />
        <StatCard
          label="Done this month"
          value={String((tasks ?? []).filter((t) => t.status === "done").length)}
        />
      </div>

      <section className="panel overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-navy/[0.02]">
            <tr>
              <th className="eyebrow px-3 py-2">Task</th>
              <th className="eyebrow px-3 py-2">Channel</th>
              <th className="eyebrow px-3 py-2">Owner</th>
              <th className="eyebrow px-3 py-2">Due</th>
              <th className="eyebrow px-3 py-2">Status</th>
              <th className="eyebrow px-3 py-2">Post metrics</th>
            </tr>
          </thead>
          <tbody>
            {(tasks ?? []).map((t) => {
              const daysOver =
                t.status !== "done" && t.due_date
                  ? Math.max(0, Math.floor((Date.now() - new Date(t.due_date).getTime()) / 86400000))
                  : 0;
              return (
                <tr key={t.id} className="border-b border-border">
                  <td className="px-3 py-2 font-medium">{t.title}</td>
                  <td className="px-3 py-2">{t.channel ?? "—"}</td>
                  <td className="px-3 py-2">{t.owner ?? "—"}</td>
                  <td className="px-3 py-2">
                    {t.due_date ?? "—"}
                    {daysOver > 0 && (
                      <span className="ml-1 text-red-600">({daysOver}d overdue)</span>
                    )}
                  </td>
                  <td className="px-3 py-2 capitalize">{t.status.replace(/_/g, " ")}</td>
                  <td className="px-3 py-2 text-muted">
                    {t.reach_impressions ?? "—"} reach · {t.engagements ?? "—"} eng
                  </td>
                </tr>
              );
            })}
            {!tasks?.length && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-muted">
                  No marketing tasks yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </MarketingPageShell>
  );
}
