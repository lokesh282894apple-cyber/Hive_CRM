import type { SupabaseClient } from "@supabase/supabase-js";
import type { Stage } from "@/lib/constants";

/** Stage depth contribution (0–45). */
const STAGE_POINTS: Partial<Record<Stage, number>> = {
  lead_created: 5,
  in_funnel: 8,
  new_lead: 10,
  call_logged_nurturing: 18,
  dnp: 8,
  no_show: 12,
  reschedule: 14,
  r1_booked: 25,
  r1_confirmed: 35,
  r1_reject: 15,
  r1_no_show: 18,
  r1_reschedule: 22,
  r2_booked: 40,
  r2_tbb: 42,
  r2_reject: 20,
  r2_no_show: 28,
  r2_reschedule: 32,
  r3_booked: 48,
  r3_tbb: 50,
  r3_no_show: 35,
  r3_reschedule: 40,
  yet_to_offer: 55,
  offered: 70,
  closed_won: 90,
  closed_lost: 5,
};

export type ScoreSignals = {
  stage: Stage | string;
  source?: string | null;
  yearsExperience?: number | null;
  callCount?: number;
  recentCallDays?: number | null;
  bookings?: { round: string; outcome: string | null }[];
  formIntentPrior?: number | null;
};

export function computeAutoScore(signals: ScoreSignals): number {
  let score = STAGE_POINTS[signals.stage as Stage] ?? 10;

  const bookings = signals.bookings ?? [];
  const hasConfirmed = bookings.some((b) => b.outcome === "confirmed");
  const hasReject = bookings.some((b) => b.outcome === "reject");
  const rounds = new Set(bookings.map((b) => b.round));
  if (rounds.has("R1")) score += 4;
  if (rounds.has("R2")) score += 6;
  if (rounds.has("R3")) score += 8;
  if (hasConfirmed) score += 8;
  if (hasReject) score -= 10;

  const calls = signals.callCount ?? 0;
  if (calls >= 1) score += 4;
  if (calls >= 3) score += 4;
  if (calls >= 6) score += 3;
  if (signals.recentCallDays != null && signals.recentCallDays <= 3) score += 5;
  else if (signals.recentCallDays != null && signals.recentCallDays > 14) score -= 5;

  const src = (signals.source || "").toLowerCase();
  if (
    src.includes("referral") ||
    src.includes("organic") ||
    src.includes("website") ||
    src.includes("inbound")
  ) {
    score += 4;
  } else if (src.includes("meta") || src.includes("google") || src.includes("paid")) {
    score += 2;
  }

  if (signals.yearsExperience != null) {
    if (signals.yearsExperience >= 2 && signals.yearsExperience <= 8) score += 3;
  }

  if (signals.formIntentPrior != null && !Number.isNaN(signals.formIntentPrior)) {
    // Blend a light prior from form/import without dominating
    score = Math.round(score * 0.85 + Math.min(100, Math.max(0, signals.formIntentPrior)) * 0.15);
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

export function effectiveScore(opts: {
  scoreAuto: number | null | undefined;
  scoreOverride: number | null | undefined;
  intentScore?: number | null | undefined;
}): number | null {
  if (opts.scoreOverride != null) return opts.scoreOverride;
  if (opts.scoreAuto != null) return opts.scoreAuto;
  if (opts.intentScore != null) return opts.intentScore;
  return null;
}

/** Load signals for a lead and write score_auto + effective intent_score (unless overridden). */
export async function recomputeLeadScore(
  supabase: SupabaseClient,
  leadId: string
): Promise<number | null> {
  const { data: lead } = await supabase
    .from("leads")
    .select(
      "id, stage, source, years_experience, intent_score, score_auto, score_override, score_override_reason"
    )
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return null;

  const [{ data: bookings }, { data: calls }] = await Promise.all([
    supabase
      .from("interview_bookings")
      .select("round, outcome")
      .eq("lead_id", leadId),
    supabase
      .from("call_logs")
      .select("logged_at")
      .eq("lead_id", leadId)
      .order("logged_at", { ascending: false })
      .limit(50),
  ]);

  let recentCallDays: number | null = null;
  if (calls?.[0]?.logged_at) {
    recentCallDays = Math.floor(
      (Date.now() - new Date(calls[0].logged_at).getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  const auto = computeAutoScore({
    stage: lead.stage,
    source: lead.source,
    yearsExperience: lead.years_experience,
    callCount: calls?.length ?? 0,
    recentCallDays,
    bookings: bookings ?? [],
    formIntentPrior: lead.score_auto == null ? lead.intent_score : null,
  });

  const effective =
    lead.score_override != null ? Number(lead.score_override) : auto;

  await supabase
    .from("leads")
    .update({
      score_auto: auto,
      intent_score: effective,
    })
    .eq("id", leadId);

  return effective;
}
