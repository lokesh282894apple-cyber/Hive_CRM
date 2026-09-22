"use server";

import { requireAuth, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type LeadTaskRow = {
  id: string;
  lead_id: string;
  title: string;
  notes: string | null;
  due_at: string;
  status: "open" | "done";
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
};

function touchTaskPaths(leadId: string) {
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads/tasks");
  revalidatePath("/admin/leads");
  revalidatePath("/leads");
}

export async function createLeadTask(input: {
  leadId: string;
  title: string;
  notes?: string | null;
  dueAt: string;
}): Promise<ActionResult> {
  const ctx = await requireAuth(["counselor", "admin"]);
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Task title is required" };
  if (!input.dueAt) return { ok: false, error: "Due date is required" };

  const supabase = createClient();
  const { error } = await supabase.from("lead_tasks").insert({
    lead_id: input.leadId,
    title: title.slice(0, 200),
    notes: input.notes?.trim()?.slice(0, 2000) || null,
    due_at: new Date(input.dueAt).toISOString(),
    status: "open",
    created_by: ctx.user.id,
  });
  if (error) return { ok: false, error: error.message };
  touchTaskPaths(input.leadId);
  return { ok: true };
}

export async function completeLeadTask(
  id: string,
  leadId: string
): Promise<ActionResult> {
  await requireUser(["counselor", "admin"]);
  const supabase = createClient();
  const { error } = await supabase
    .from("lead_tasks")
    .update({
      status: "done",
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  touchTaskPaths(leadId);
  return { ok: true };
}

export async function reopenLeadTask(
  id: string,
  leadId: string
): Promise<ActionResult> {
  await requireUser(["counselor", "admin"]);
  const supabase = createClient();
  const { error } = await supabase
    .from("lead_tasks")
    .update({ status: "open", completed_at: null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  touchTaskPaths(leadId);
  return { ok: true };
}

export async function deleteLeadTask(
  id: string,
  leadId: string
): Promise<ActionResult> {
  await requireUser(["counselor", "admin"]);
  const supabase = createClient();
  const { error } = await supabase.from("lead_tasks").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  touchTaskPaths(leadId);
  return { ok: true };
}
