import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/supabase/paginate";

export type RejectionFunnel = {
  hiveTotal: number;
  studentTotal: number;
  byStage: { stage: string; hive: number; student: number }[];
  hiveReasons: { reason: string; count: number }[];
  studentReasons: { reason: string; count: number }[];
  noShowReasons: { reason: string; count: number }[];
  offeredAccepted: number;
  offeredStudentReject: number;
  offeredPending: number;
  avgProfile: number | null;
  avgIntent: number | null;
  /** True when meeting migration columns are missing */
  schemaPending?: boolean;
};

const STAGES = ["nurturing", "r1", "r2", "r3", "offered"] as const;

function emptyFunnel(schemaPending = false): RejectionFunnel {
  return {
    hiveTotal: 0,
    studentTotal: 0,
    byStage: STAGES.map((stage) => ({ stage, hive: 0, student: 0 })),
    hiveReasons: [],
    studentReasons: [],
    noShowReasons: [],
    offeredAccepted: 0,
    offeredStudentReject: 0,
    offeredPending: 0,
    avgProfile: null,
    avgIntent: null,
    schemaPending,
  };
}

function isMissingColumnError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /column .* does not exist/i.test(msg) ||
    /could not find the table/i.test(msg) ||
    /relation .* does not exist/i.test(msg)
  );
}

function inferRejectKind(stage: string): "hive" | "student" | null {
  if (stage === "student_reject") return "student";
  if (
    stage === "admission_team_rejected" ||
    stage === "r1_reject" ||
    stage === "r2_reject" ||
    stage === "r3_reject"
  ) {
    return "hive";
  }
  return null;
}

function inferRejectAtStage(stage: string): string {
  if (stage.startsWith("r1")) return "r1";
  if (stage.startsWith("r2")) return "r2";
  if (stage.startsWith("r3")) return "r3";
  if (stage.includes("offer")) return "offered";
  return "nurturing";
}

type LeadRejectRow = {
  id: string;
  stage: string;
  reject_kind?: string | null;
  reject_at_stage?: string | null;
  stage_reason: string | null;
  reject_reason_category?: string | null;
};

export async function fetchRejectionFunnel(
  supabase: SupabaseClient,
  opts: { sinceIso: string; untilExclusiveIso: string }
): Promise<RejectionFunnel> {
  let schemaPending = false;
  let leads: LeadRejectRow[] = [];

  try {
    leads = await fetchAllPages<LeadRejectRow>((from, to) =>
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
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
    schemaPending = true;
    // Fallback until migration 20260922120000_meeting_followups.sql is applied
    leads = await fetchAllPages<LeadRejectRow>((from, to) =>
      supabase
        .from("leads")
        .select("id, stage, stage_reason")
        .gte("updated_at", opts.sinceIso)
        .lt("updated_at", opts.untilExclusiveIso)
        .order("updated_at", { ascending: true })
        .range(from, to)
    , "reject-leads-fallback");
  }

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

    const kind = (l.reject_kind as "hive" | "student" | null) || inferRejectKind(l.stage);
    if (!kind) continue;
    const bucket =
      (l.reject_at_stage && stageIndex[l.reject_at_stage] != null
        ? l.reject_at_stage
        : inferRejectAtStage(l.stage)) || "nurturing";
    const idx = stageIndex[bucket] ?? 0;
    if (kind === "hive") {
      hiveTotal += 1;
      byStage[idx].hive += 1;
      const r = (l.reject_reason_category || l.stage_reason || "Unknown").slice(0, 80);
      hiveReasons.set(r, (hiveReasons.get(r) ?? 0) + 1);
    } else {
      studentTotal += 1;
      byStage[idx].student += 1;
      const r = (l.reject_reason_category || l.stage_reason || "Unknown").slice(0, 80);
      studentReasons.set(r, (studentReasons.get(r) ?? 0) + 1);
    }
  }

  let avgProfile: number | null = null;
  let avgIntent: number | null = null;
  try {
    const { data: scores, error } = await supabase
      .from("lead_stage_scores")
      .select("profile_score, intent_score")
      .gte("created_at", opts.sinceIso)
      .lt("created_at", opts.untilExclusiveIso)
      .limit(5000);
    if (error) {
      if (isMissingColumnError(error) || /does not exist/i.test(error.message)) {
        schemaPending = true;
      }
    } else if (scores?.length) {
      avgProfile = Number(
        (scores.reduce((s, r) => s + r.profile_score, 0) / scores.length).toFixed(2)
      );
      avgIntent = Number(
        (scores.reduce((s, r) => s + r.intent_score, 0) / scores.length).toFixed(2)
      );
    }
  } catch {
    schemaPending = true;
  }

  const noShowReasons = new Map<string, number>();
  try {
    const { data: noShows, error } = await supabase
      .from("interview_bookings")
      .select("no_show_informed, no_show_reason")
      .not("no_show_reason", "is", null)
      .gte("submitted_at", opts.sinceIso)
      .lt("submitted_at", opts.untilExclusiveIso)
      .limit(2000);
    if (error) {
      if (/does not exist/i.test(error.message)) schemaPending = true;
    } else {
      for (const n of noShows ?? []) {
        const label = n.no_show_informed
          ? `Informed: ${(n.no_show_reason || "—").slice(0, 60)}`
          : `Ghosted: ${(n.no_show_reason || "Ghosted completely").slice(0, 60)}`;
        noShowReasons.set(label, (noShowReasons.get(label) ?? 0) + 1);
      }
    }
  } catch {
    schemaPending = true;
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
    noShowReasons: Array.from(noShowReasons.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
    offeredAccepted,
    offeredStudentReject,
    offeredPending,
    avgProfile,
    avgIntent,
    schemaPending,
  };
}

export { emptyFunnel };
