import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Primitives";
import {
  LeadTasksBoard,
  type TaskWithLead,
} from "@/components/leads/LeadTasksBoard";
import { viewAsHref } from "@/lib/impersonation";

export default async function LeadTasksPage() {
  const ctx = await requireAuth(["counselor", "admin"]);
  const user = ctx.user;
  const supabase = createClient();
  const isAdmin = user.role === "admin" && !ctx.impersonating;
  const basePath = ctx.impersonating
    ? viewAsHref(user.id, "/leads")
    : "/leads";

  let query = supabase
    .from("lead_tasks")
    .select(
      "id, lead_id, title, notes, due_at, status, created_by, completed_at, created_at, lead:leads!lead_tasks_lead_id_fkey(id, name, phone, lead_allocated_to)"
    )
    .eq("status", "open")
    .order("due_at", { ascending: true })
    .limit(200);

  // Counselors: only tasks on leads allocated to them (RLS also applies)
  if (!isAdmin) {
    const { data: mine } = await supabase
      .from("leads")
      .select("id")
      .eq("lead_allocated_to", user.id);
    const ids = (mine ?? []).map((l) => l.id);
    if (!ids.length) {
      return (
        <div>
          <PageHeader
            eyebrow="Pipeline"
            title="My"
            accent="Tasks"
            description="Callbacks and reminders across your leads — Today, overdue, and upcoming."
            actions={
              <Link href={basePath} className="btn-secondary">
                Back to leads
              </Link>
            }
          />
          <LeadTasksBoard tasks={[]} />
        </div>
      );
    }
    query = query.in("lead_id", ids);
  }

  const { data, error } = await query;
  const tasks = (error ? [] : (data as unknown as TaskWithLead[])) ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Pipeline"
        title="My"
        accent="Tasks"
        description="Callbacks and reminders across your leads — Today, overdue, and upcoming."
        actions={
          <Link href={basePath} className="btn-secondary">
            Back to leads
          </Link>
        }
      />
      {error ? (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Could not load tasks ({error.message}). Run migration{" "}
          <code className="text-xs">20260922160000_lead_tasks_and_call_delete.sql</code>{" "}
          on Supabase if the table is missing.
        </p>
      ) : null}
      <LeadTasksBoard tasks={tasks} />
    </div>
  );
}
