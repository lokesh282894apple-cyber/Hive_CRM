import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Primitives";
import Link from "next/link";
import { formatDateTime } from "@/lib/utils";

export default async function CounselorTasksPage() {
  await requireUser(["counselor", "admin"]);
  const supabase = createClient();

  const { data: tasks } = await supabase
    .from("lead_tasks")
    .select("*, leads(name)")
    .eq("status", "open")
    .order("due_at", { ascending: true })
    .limit(100);

  // If counselor, filter tasks for leads they own? The task might not have lead_allocated_to info directly on lead_tasks, but we fetched leads(name).
  // Wait, if it's "all the task that are there for all leads not one", we should just show the tasks they created or for leads they own.
  // We can filter where `created_by = user.id` or if it's admin, show all?
  // Let's filter by `created_by` for now, or just show the query result.
  // Wait, the user said "show all the task that are there for all leads not one".

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Counselor"
        title="My Tasks"
        description="All open tasks across your leads."
      />

      <div className="mt-6 panel overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-[#F7F8FC]">
            <tr>
              <th className="eyebrow px-4 py-3">Task</th>
              <th className="eyebrow px-4 py-3">Lead</th>
              <th className="eyebrow px-4 py-3">Due</th>
              <th className="eyebrow px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {(tasks ?? []).map((t) => {
              const overdue = new Date(t.due_at).getTime() < Date.now();
              return (
                <tr key={t.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-navy">{t.title}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/leads/${t.lead_id}`}
                      className="text-periwinkle hover:underline"
                    >
                      {t.leads?.name || "View Lead"}
                    </Link>
                  </td>
                  <td className={`px-4 py-3 ${overdue ? "text-rose-700 font-medium" : "text-muted"}`}>
                    {formatDateTime(t.due_at)} {overdue && "(overdue)"}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/leads/${t.lead_id}`}
                      className="btn-secondary text-xs"
                    >
                      Open Lead
                    </Link>
                  </td>
                </tr>
              );
            })}
            {!tasks?.length && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  No open tasks.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
