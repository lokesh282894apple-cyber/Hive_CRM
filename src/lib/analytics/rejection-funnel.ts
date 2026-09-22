import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/supabase/paginate";

export type RejectionFunnel = {
  hiveTotal: number;
  studentTotal: number;
  byStage: { stage: string; hive: number; student: number }[];
  hiveReasons: { reason: string; count: number }[];
  studentReasons: { reason: string; count: number }[];
  offeredAccepted: number;
  offeredStudentReject: number;
  offeredPending: number;
  avgProfile: number | null;
  avgIntent: number | null;
};

const STAGES = ["nurturing", "r1", "r2", "r3", "offered"] as const;

export async function fetchRejectionFunnel(
  supabase: SupabaseClient,
  opts: { sinceIso: string; untilExclusiveIso: string }
): Promise<RejectionFunnel> {
  const leads = await fetchAllPages<{
    id: string;
    stage: string;
    reject_kind: string | null;
    reject_at_stage: string | null;
    stage_reason: string | null;
    reject_reason_category: string | null;
  }>((from, to) =>
    supabase
      .from("leads")
      .select(
        "id, stage, reject_kind, reject_at_stage, stage_reason, reject_reason_category"
      )
      .gte("updated_at", opts.sinceIso)
      .lt("updated_at", opts.untilExclusiveIso)
      .order("updated_at", { ascending: true })
      .range(from, to)
  , "reject-leads");

  const byStage = STAGES.map((stage) => ({
    stage,
    hive: 0,
    student: 0,
  }));
  const stageIndex = Object.fromEntries(STAGES.map((s, i) => [s, i]));

  let hiveTotal = 0;
  let studentTotal = 0;
  const hiveReasons = new Map<string, number>();
  const studentReasons = new Map<string, number>();

  let offeredAccepted = 0;
  let offeredStudentReject = 0;
  let offeredPending = 0;

  for (const l of leads) {
    if (l.stage === "offered_accepted" || l.stage === "closed_paid") {
      offeredAccepted += 1;
    }
    if (l.stage === "student_reject") offeredStudentReject += 1;
    if (l.stage === "offered" || l.stage === "yet_to_offer") {
      offeredPending += 1;
    }

    if (!l.reject_kind) continue;
    const bucket =
      l.reject_at_stage && stageIndex[l.reject_at_stage] != null
        ? l.reject_at_stage
        : "nurturing";
    const idx = stageIndex[bucket] ?? 0;
    if (l.reject_kind === "hive") {
      hiveTotal += 1;
      byStage[idx].hive += 1;
      const r = (l.reject_reason_category || l.stage_reason || "Unknown").slice(
        0,
        80
      );
      hiveReasons.set(r, (hiveReasons.get(r) ?? 0) + 1);
    } else if (l.reject_kind === "student") {
      studentTotal += 1;
      byStage[idx].student += 1;
      const r = (l.reject_reason_category || l.stage_reason || "Unknown").slice(
        0,
        80
      );
      studentReasons.set(r, (studentReasons.get(r) ?? 0) + 1);
    }
  }

  const { data: scores } = await supabase
    .from("lead_stage_scores")
    .select("profile_score, intent_score")
    .gte("created_at", opts.sinceIso)
    .lt("created_at", opts.untilExclusiveIso)
    .limit(5000);

  let avgProfile: number | null = null;
  let avgIntent: number | null = null;
  if (scores?.length) {
    avgProfile = Number(
      (
        scores.reduce((s, r) => s + r.profile_score, 0) / scores.length
      ).toFixed(2)
    );
    avgIntent = Number(
      (
        scores.reduce((s, r) => s + r.intent_score, 0) / scores.length
      ).toFixed(2)
    );
  }

  return {
    hiveTotal,
    studentTotal,
    byStage,
    hiveReasons: Array.from(hiveReasons.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
    studentReasons: Array.from(studentReasons.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
    offeredAccepted,
    offeredStudentReject,
    offeredPending,
    avgProfile,
    avgIntent,
  };
}
