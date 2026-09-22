"use server";

import { requireAuth, requireUser } from "@/lib/auth";
import type { Stage } from "@/lib/constants";
import {
  isBookingRequiredStage,
  STAGES,
  STAGE_TRANSITIONS,
  stageRequiresReason,
  stageRequiresPresetReason,
  stageRequiresStudentIntent,
  isValidRejectionReasonForStage,
  rejectAtStageFromLeadStage,
} from "@/lib/constants";
import { getFunnelConfig } from "@/lib/funnel/config";
import { recomputeLeadScore } from "@/lib/leads/score";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ActionResult = { ok: true } | { ok: false; error: string };

function touchLeadPaths(leadId?: string) {
  if (leadId) revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
}

export async function createLead(
  formData: FormData
): Promise<ActionResult & { id?: string }> {
  const user = await requireUser(["counselor", "admin"]);
  const supabase = createClient();

  const intentPrior = formData.get("intent_score")
    ? Number(formData.get("intent_score"))
    : null;

  const courseId = String(formData.get("course_id") || "") || null;
  let cohortId = String(formData.get("cohort_id") || "") || null;
  if (courseId && !cohortId) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { resolveCohortForCourse } = await import("@/lib/leads/resolve-cohort");
    cohortId = await resolveCohortForCourse(createAdminClient(), courseId);
  }
  let allocatedTo =
    user.role === "admin"
      ? String(formData.get("lead_allocated_to") || "") || null
      : user.id;
  if (!allocatedTo && courseId) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { pickCounselorForCourse } = await import("@/lib/leads/assign-counselor");
    allocatedTo = await pickCounselorForCourse(createAdminClient(), courseId);
  }

  const payload = {
    name: String(formData.get("name") || "").trim(),
    email: String(formData.get("email") || "").trim() || null,
    phone: String(formData.get("phone") || "").trim(),
    linkedin: String(formData.get("linkedin") || "").trim() || null,
    course_id: courseId,
    cohort_id: cohortId,
    source: String(formData.get("source") || "other"),
    years_experience: formData.get("years_experience")
      ? Number(formData.get("years_experience"))
      : null,
    preferred_industry: String(formData.get("preferred_industry") || "").trim() || null,
    intent_score: intentPrior,
    score_auto: intentPrior,
    lead_allocated_to: allocatedTo || (user.role === "admin" ? user.id : user.id),
    stage: "new_lead" as Stage,
  };

  if (!payload.name || !payload.phone) {
    return { ok: false, error: "Name and phone are required" };
  }

  const { data, error } = await supabase.from("leads").insert(payload).select("id").single();
  if (error) return { ok: false, error: error.message };

  await recomputeLeadScore(supabase, data.id);

  touchLeadPaths();
  return { ok: true, id: data.id };
}

export async function updateLeadStage(
  leadId: string,
  stage: Stage | string,
  notes?: string,
  opts?: {
    studentIntent?: number;
    skipIntentRequirement?: boolean;
    /** When closing won, may patch program/cohort in the same move */
    courseId?: string | null;
    cohortId?: string | null;
  }
): Promise<ActionResult> {
  const user = await requireUser(["counselor", "admin"]);
  const supabase = createClient();
  const funnel = await getFunnelConfig();
  const known = new Set([...STAGES, ...funnel.activeSlugs]);
  if (!known.has(stage)) return { ok: false, error: "Invalid stage" };

  if (
    isBookingRequiredStage(stage as Stage) ||
    funnel.bookingRequiredSlugs.includes(stage)
  ) {
    return {
      ok: false,
      error:
        "Date, time, and panelist are required. Book the interview from the board dialog or Book interview page.",
    };
  }

  const { data: lead } = await supabase
    .from("leads")
    .select("stage, course_id, cohort_id")
    .eq("id", leadId)
    .single();

  if (!lead) return { ok: false, error: "Lead not found" };

  if (lead.stage === stage) {
    return { ok: true };
  }

  if (stage === "closed_paid") {
    const courseId = opts?.courseId ?? lead.course_id;
    const cohortId = opts?.cohortId ?? lead.cohort_id;
    if (!courseId || !cohortId) {
      return {
        ok: false,
        error:
          "Confirm program and cohort (with cohort number) before closed won",
      };
    }
  }

  if (user.role !== "admin") {
    const allowedFromDb = funnel.transitions[lead.stage] ?? [];
    const allowedFromConst = STAGE_TRANSITIONS[lead.stage as Stage] ?? [];
    const allowed = allowedFromDb.length ? allowedFromDb : allowedFromConst;
    if (!allowed.includes(stage)) {
      return { ok: false, error: `Cannot move from ${lead.stage} to ${stage}` };
    }
  }

  const reason = notes?.trim() || "";
  const needsReason =
    stageRequiresReason(stage) || funnel.reasonRequiredSlugs.includes(stage);
  if (needsReason && !reason) {
    return {
      ok: false,
      error: stageRequiresPresetReason(stage)
        ? "Pick a rejection reason before moving this lead"
        : "This stage requires a typed reason",
    };
  }
  if (stageRequiresPresetReason(stage) && !isValidRejectionReasonForStage(stage, reason)) {
    return { ok: false, error: "Invalid rejection reason" };
  }

  const intent = opts?.studentIntent;
  const needsIntent =
    !opts?.skipIntentRequirement && stageRequiresStudentIntent(stage);
  if (needsIntent) {
    if (
      intent == null ||
      !Number.isInteger(intent) ||
      intent < 1 ||
      intent > 5
    ) {
      return {
        ok: false,
        error: "Student intent (1–5) is required when moving stages",
      };
    }
    const { recordStudentIntentScore } = await import("@/app/actions/scores");
    const scored = await recordStudentIntentScore({
      leadId,
      intentScore: intent,
      context: `stage_advance:${lead.stage}->${stage}`,
      notes: reason || null,
    });
    if (!scored.ok) return scored;
  }

  const rejectKind =
    stage === "student_reject"
      ? "student"
      : stage === "admission_team_rejected" ||
          stage === "r1_reject" ||
          stage === "r2_reject" ||
          stage === "r3_reject"
        ? "hive"
        : null;

  const rejectAt = rejectKind
    ? rejectAtStageFromLeadStage(lead.stage)
    : null;

  const { error } = await supabase
    .from("leads")
    .update({
      stage,
      stage_reason: reason || null,
      ...(stage === "closed_paid" && opts?.courseId && opts?.cohortId
        ? { course_id: opts.courseId, cohort_id: opts.cohortId }
        : {}),
      ...(rejectKind
        ? {
            reject_kind: rejectKind,
            reject_at_stage: rejectAt,
            reject_reason_category: reason.slice(0, 120),
          }
        : {}),
    })
    .eq("id", leadId);
  if (error) return { ok: false, error: error.message };

  if (reason) {
    await supabase.from("stage_history").insert({
      lead_id: leadId,
      from_stage: lead.stage,
      to_stage: stage,
      changed_by: user.id,
      notes: reason,
    });
  }

  await recomputeLeadScore(supabase, leadId);

  // Event-driven outbound (WA + email) — never screen-hardcoded
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { dispatchStageTriggers } = await import("@/lib/integrations/dispatch");
    await dispatchStageTriggers(createAdminClient(), {
      leadId,
      stage: stage as Stage,
    });
  } catch (err) {
    console.error("[dispatchStageTriggers]", err);
  }
  touchLeadPaths(leadId);

  if (stage === "closed_paid") {
    try {
      const { ensureConvertedFeeScaffold } = await import("@/app/actions/program-fees");
      await ensureConvertedFeeScaffold(leadId);
    } catch (err) {
      console.error("[ensureConvertedFeeScaffold]", err);
    }
  }

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
  touchLeadPaths(leadId);
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
  touchLeadPaths(leadId);
  return { ok: true };
}

export async function recomputeLeadScoreAction(leadId: string): Promise<ActionResult> {
  await requireUser(["counselor", "admin"]);
  const supabase = createClient();
  await recomputeLeadScore(supabase, leadId);
  touchLeadPaths(leadId);
  return { ok: true };
}

export async function reassignLead(
  leadId: string,
  counselorId: string
): Promise<ActionResult> {
  await requireUser(["admin", "counselor"]);
  const supabase = createClient();
  const { data: before } = await supabase
    .from("leads")
    .select("lead_allocated_to")
    .eq("id", leadId)
    .maybeSingle();
  const { error } = await supabase
    .from("leads")
    .update({ lead_allocated_to: counselorId || null })
    .eq("id", leadId);
  if (error) return { ok: false, error: error.message };
  if (counselorId && counselorId !== before?.lead_allocated_to) {
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const { dispatchCounsellorAllocated } = await import(
        "@/lib/integrations/dispatch"
      );
      await dispatchCounsellorAllocated(createAdminClient(), leadId);
    } catch (err) {
      console.error("[dispatchCounsellorAllocated]", err);
    }
  }
  touchLeadPaths(leadId);
  return { ok: true };
}

export async function claimLead(leadId: string): Promise<ActionResult> {
  const user = await requireUser(["counselor", "admin"]);
  const supabase = createClient();
  const { data, error } = await supabase
    .from("leads")
    .update({ lead_allocated_to: user.id })
    .eq("id", leadId)
    .is("lead_allocated_to", null)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (data?.id) {
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const { dispatchCounsellorAllocated } = await import(
        "@/lib/integrations/dispatch"
      );
      await dispatchCounsellorAllocated(createAdminClient(), leadId);
    } catch (err) {
      console.error("[dispatchCounsellorAllocated]", err);
    }
  }
  touchLeadPaths(leadId);
  return { ok: true };
}

export async function createCallLog(formData: FormData): Promise<ActionResult> {
  const ctx = await requireAuth(["counselor", "admin"]);
  // Attribute to real admin when View as (audit); otherwise effective user
  const counselorId = ctx.impersonating ? ctx.actor.id : ctx.user.id;
  const supabase = createClient();

  const leadId = String(formData.get("lead_id") || "");
  const rawNotes = String(formData.get("notes") || "").trim();
  const notes = ctx.impersonating
    ? `${rawNotes}${rawNotes ? " · " : ""}View as ${ctx.user.name}`
    : rawNotes;
  const payload = {
    lead_id: leadId,
    counselor_id: counselorId,
    outcome: String(formData.get("outcome") || "other"),
    duration: formData.get("duration") ? Number(formData.get("duration")) : null,
    notes: notes || null,
    recording_url: String(formData.get("recording_url") || "").trim() || null,
  };

  if (!payload.lead_id) return { ok: false, error: "Missing lead" };

  const { error } = await supabase.from("call_logs").insert({
    ...payload,
    call_source: "manual",
    direction: "outbound",
  });
  if (error) return { ok: false, error: error.message };

  if (payload.outcome === "dnp") {
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const { dispatchStageTriggers } = await import("@/lib/integrations/dispatch");
      await dispatchStageTriggers(createAdminClient(), {
        leadId: payload.lead_id,
        triggerKey: "dnp",
      });
    } catch (err) {
      console.error("[dispatch DNP]", err);
    }
  }

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

  // Keep last_contacted_at in sync after hard delete
  const { data: remaining } = await supabase
    .from("call_logs")
    .select("logged_at")
    .eq("lead_id", leadId)
    .order("logged_at", { ascending: false })
    .limit(1);
  const lastAt = remaining?.[0]?.logged_at ?? null;
  await supabase
    .from("leads")
    .update({ last_contacted_at: lastAt })
    .eq("id", leadId);

  await recomputeLeadScore(supabase, leadId);
  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

export async function updateLeadCardFields(
  leadId: string,
  patch: {
    counselor_intent_check?: string | null;
    convert_probability?: "confirmed_to_pay" | "low_intent" | null;
    offer_call_status?: "not_booked" | "booked" | "done" | null;
    offer_accept_deadline?: string | null;
    recording_url?: string | null;
  }
): Promise<ActionResult> {
  await requireUser(["counselor", "admin", "interviewer"]);
  const supabase = createClient();
  const { error } = await supabase.from("leads").update(patch).eq("id", leadId);
  if (error) return { ok: false, error: error.message };
  touchLeadPaths(leadId);
  return { ok: true };
}

/** Toggle an approval slot. Writable by admin or panelist; visible to all counselors. */
export async function setLeadApproval(input: {
  leadId: string;
  slot?: string;
  label?: string;
  status: boolean;
}): Promise<ActionResult> {
  const user = await requireUser(["admin", "interviewer"]);
  const supabase = createClient();
  const slot = input.slot || "leadership";
  const label = input.label || (slot === "leadership" ? "Approved by Nikhil" : slot);
  const now = new Date().toISOString();
  const { error } = await supabase.from("lead_approvals").upsert(
    {
      lead_id: input.leadId,
      slot,
      label,
      status: input.status,
      approved_by: input.status ? user.id : null,
      approved_at: input.status ? now : null,
      updated_at: now,
    },
    { onConflict: "lead_id,slot" }
  );
  if (error) return { ok: false, error: error.message };
  touchLeadPaths(input.leadId);
  return { ok: true };
}

export async function upsertPanelistGrade(input: {
  leadId: string;
  tier: "A" | "B" | "C";
  score: number;
}): Promise<ActionResult> {
  const user = await requireUser(["interviewer", "admin", "counselor"]);
  const supabase = createClient();
  const score = Math.min(5, Math.max(0, Number(input.score)));
  const { error } = await supabase.from("lead_panelist_grades").upsert(
    {
      lead_id: input.leadId,
      panelist_id: user.id,
      tier: input.tier,
      score,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "lead_id,panelist_id" }
  );
  if (error) return { ok: false, error: error.message };
  touchLeadPaths(input.leadId);
  revalidatePath("/interviewer/interviews");
  return { ok: true };
}
