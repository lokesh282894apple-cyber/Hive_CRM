"use server";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Append-only profile + intent score (SC-3). Never overwrites prior rows. */
export async function recordLeadStageScore(input: {
  leadId: string;
  context: string;
  round?: "R1" | "R2" | "R3" | null;
  profileScore: number;
  intentScore: number;
  notes?: string | null;
}): Promise<ActionResult> {
  const user = await requireUser(["counselor", "admin", "interviewer"]);
  const profile = Number(input.profileScore);
  const intent = Number(input.intentScore);
  if (
    !Number.isInteger(profile) ||
    profile < 1 ||
    profile > 5 ||
    !Number.isInteger(intent) ||
    intent < 1 ||
    intent > 5
  ) {
    return { ok: false, error: "Profile and intent scores must be 1–5" };
  }
  const notes = (input.notes || "").trim();
  if (input.context === "admission_r1" && notes.length < 2) {
    return { ok: false, error: "Profile notes are required for R1 booking" };
  }
  if (input.context.startsWith("panel_") && notes.length < 2) {
    return { ok: false, error: "Interview feedback is required" };
  }

  const supabase = createClient();
  const { error } = await supabase.from("lead_stage_scores").insert({
    lead_id: input.leadId,
    scored_by: user.id,
    context: input.context,
    round: input.round ?? null,
    profile_score: profile,
    intent_score: intent,
    notes: notes || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/leads/${input.leadId}`);
  return { ok: true };
}
