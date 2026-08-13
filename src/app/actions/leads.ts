"use server";

import { requireUser } from "@/lib/auth";
import type { Stage } from "@/lib/constants";
import { isBookingRequiredStage, STAGES, STAGE_TRANSITIONS } from "@/lib/constants";
import { recomputeLeadScore } from "@/lib/leads/score";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createLead(
  formData: FormData
): Promise<ActionResult & { id?: string }> {
  const user = await requireUser(["counselor", "admin"]);
  const supabase = createClient();

  const intentPrior = formData.get("intent_score")
    ? Number(formData.get("intent_score"))
    : null;

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
    intent_score: intentPrior,
    score_auto: intentPrior,
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

  await recomputeLeadScore(supabase, data.id);

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

  if (isBookingRequiredStage(stage)) {
    return {
      ok: false,
      error:
        "Date, time, and panelist are required. Book the interview from the board dialog or Book interview page.",
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

  await recomputeLeadScore(supabase, leadId);

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
  };

  const { error } = await supabase.from("leads").update(payload).eq("id", leadId);
  if (error) return { ok: false, error: error.message };

  await recomputeLeadScore(supabase, leadId);

  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

export async function setLeadScoreOverride(
  leadId: string,
  score: number,
  reason: string
): Promise<ActionResult> {
  const user = await requireUser(["counselor", "admin"]);
  const supabase = createClient();

  const value = Math.min(100, Math.max(0, Math.round(score)));
  const why = reason.trim();
  if (!why) return { ok: false, error: "Reason is required when adjusting score" };

  const { error } = await supabase
    .from("leads")
    .update({
      score_override: value,
      score_override_reason: why,
      score_override_by: user.id,
      score_override_at: new Date().toISOString(),
      intent_score: value,
    })
    .eq("id", leadId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  return { ok: true };
}

export async function clearLeadScoreOverride(leadId: string): Promise<ActionResult> {
  await requireUser(["counselor", "admin"]);
  const supabase = createClient();

  const { error } = await supabase
    .from("leads")
    .update({
      score_override: null,
      score_override_reason: null,
      score_override_by: null,
      score_override_at: null,
    })
    .eq("id", leadId);
  if (error) return { ok: false, error: error.message };

  await recomputeLeadScore(supabase, leadId);

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  return { ok: true };
}

export async function recomputeLeadScoreAction(leadId: string): Promise<ActionResult> {
  await requireUser(["counselor", "admin"]);
  const supabase = createClient();
  await recomputeLeadScore(supabase, leadId);
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
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

  await supabase
    .from("leads")
    .update({ last_contacted_at: new Date().toISOString() })
    .eq("id", leadId);

  await recomputeLeadScore(supabase, leadId);

  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

export async function deleteCallLog(id: string, leadId: string): Promise<ActionResult> {
  await requireUser(["counselor", "admin"]);
  const supabase = createClient();
  const { error } = await supabase.from("call_logs").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await recomputeLeadScore(supabase, leadId);
  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}
