"use server";

import { requireUser } from "@/lib/auth";
import type { Stage } from "@/lib/constants";
import { STAGES, STAGE_TRANSITIONS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createLead(
  formData: FormData
): Promise<ActionResult & { id?: string }> {
  const user = await requireUser(["counselor", "admin"]);
  const supabase = createClient();

  const payload = {
    name: String(formData.get("name") || "").trim(),
    email: String(formData.get("email") || "").trim() || null,
    phone: String(formData.get("phone") || "").trim(),
    linkedin: String(formData.get("linkedin") || "").trim() || null,
    course_id: String(formData.get("course_id") || "") || null,
    cohort_id: String(formData.get("cohort_id") || "") || null,
    source: String(formData.get("source") || "other"),
    years_experience: formData.get("years_experience")
      ? Number(formData.get("years_experience"))
      : null,
    preferred_industry: String(formData.get("preferred_industry") || "").trim() || null,
    intent_score: formData.get("intent_score")
      ? Number(formData.get("intent_score"))
      : null,
    lead_allocated_to:
      user.role === "admin"
        ? String(formData.get("lead_allocated_to") || "") || user.id
        : user.id,
    stage: "new_lead" as Stage,
  };

  if (!payload.name || !payload.phone) {
    return { ok: false, error: "Name and phone are required" };
  }

  const { data, error } = await supabase.from("leads").insert(payload).select("id").single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/leads");
  revalidatePath("/admin/leads");
  return { ok: true, id: data.id };
}

export async function updateLeadStage(
  leadId: string,
  stage: Stage,
  notes?: string
): Promise<ActionResult> {
  const user = await requireUser(["counselor", "admin"]);
  const supabase = createClient();

  if (!STAGES.includes(stage)) return { ok: false, error: "Invalid stage" };

  const bookingRequired: Stage[] = [
    "r1_booked",
    "r2_booked",
    "r3_booked",
    "r1_reschedule",
    "r2_reschedule",
    "r3_reschedule",
  ];
  if (bookingRequired.includes(stage)) {
    return {
      ok: false,
      error:
        "Date, time, and panelist are required. Use Book interview (or Manual override) to move into Booked / Reschedule.",
    };
  }

  const { data: lead } = await supabase
    .from("leads")
    .select("stage")
    .eq("id", leadId)
    .single();

  if (!lead) return { ok: false, error: "Lead not found" };

  if (user.role !== "admin") {
    const allowed = STAGE_TRANSITIONS[lead.stage as Stage] ?? [];
    if (!allowed.includes(stage)) {
      return { ok: false, error: `Cannot move from ${lead.stage} to ${stage}` };
    }
  }

  const { error } = await supabase.from("leads").update({ stage }).eq("id", leadId);
  if (error) return { ok: false, error: error.message };

  if (notes) {
    await supabase.from("stage_history").insert({
      lead_id: leadId,
      from_stage: lead.stage,
      to_stage: stage,
      changed_by: user.id,
      notes,
    });
  }

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/admin/leads");
  return { ok: true };
}

export async function updateLeadInfo(
  leadId: string,
  formData: FormData
): Promise<ActionResult> {
  await requireUser(["counselor", "admin"]);
  const supabase = createClient();

  const payload = {
    name: String(formData.get("name") || "").trim(),
    email: String(formData.get("email") || "").trim() || null,
    phone: String(formData.get("phone") || "").trim(),
    linkedin: String(formData.get("linkedin") || "").trim() || null,
    course_id: String(formData.get("course_id") || "") || null,
    cohort_id: String(formData.get("cohort_id") || "") || null,
    source: String(formData.get("source") || "") || null,
    years_experience: formData.get("years_experience")
      ? Number(formData.get("years_experience"))
      : null,
    preferred_industry: String(formData.get("preferred_industry") || "").trim() || null,
    intent_score: formData.get("intent_score")
      ? Number(formData.get("intent_score"))
      : null,
  };

  const { error } = await supabase.from("leads").update(payload).eq("id", leadId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

export async function reassignLead(
  leadId: string,
  counselorId: string
): Promise<ActionResult> {
  await requireUser(["admin", "counselor"]);
  const supabase = createClient();
  const { error } = await supabase
    .from("leads")
    .update({ lead_allocated_to: counselorId || null })
    .eq("id", leadId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/leads");
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

export async function claimLead(leadId: string): Promise<ActionResult> {
  const user = await requireUser(["counselor", "admin"]);
  const supabase = createClient();
  const { error } = await supabase
    .from("leads")
    .update({ lead_allocated_to: user.id })
    .eq("id", leadId)
    .is("lead_allocated_to", null);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  return { ok: true };
}

export async function createCallLog(formData: FormData): Promise<ActionResult> {
  const user = await requireUser(["counselor", "admin"]);
  const supabase = createClient();

  const leadId = String(formData.get("lead_id") || "");
  const payload = {
    lead_id: leadId,
    counselor_id: user.id,
    outcome: String(formData.get("outcome") || "other"),
    duration: formData.get("duration") ? Number(formData.get("duration")) : null,
    notes: String(formData.get("notes") || "").trim() || null,
    recording_url: String(formData.get("recording_url") || "").trim() || null,
  };

  if (!payload.lead_id) return { ok: false, error: "Missing lead" };

  const { error } = await supabase.from("call_logs").insert(payload);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

export async function deleteCallLog(id: string, leadId: string): Promise<ActionResult> {
  await requireUser(["counselor", "admin"]);
  const supabase = createClient();
  const { error } = await supabase.from("call_logs").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}
