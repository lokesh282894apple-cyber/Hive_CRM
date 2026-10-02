import type { SupabaseClient } from "@supabase/supabase-js";
import { cachedAdmissionsQuery } from "@/lib/analytics/admissions-cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllPages, mapInChunks } from "@/lib/supabase/paginate";
import {
  ADMISSION_REJECTION_REASONS,
  ADMISSION_REJECTION_REASONS_HIDDEN,
  STUDENT_REJECTION_REASONS,
} from "@/lib/constants";

export type ReasonShare = {
  reason: string;
  count: number;
  /** % of all rejects of this kind in the range */
  pct: number | null;
  /** count per stage bucket (nurturing / r1 / r2 / r3 / offered) */
  byStage: Record<string, number>;
};

export type RejectionFunnel = {
  /** Reason × stage, % of all Hive rejects — the team's rejection dashboard */
  hiveReasonShares: ReasonShare[];
  studentReasonShares: ReasonShare[];
  /** Free-text "Custom" reasons, most common first */
  hiveCustomReasons: { reason: string; count: number }[];
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

const EVENT_STAGES = [
  "admission_team_rejected",
  "r1_reject",
  "r2_reject",
  "r3_reject",
  "student_reject",
  "r1_student_reject",
  "r2_student_reject",
  "r3_student_reject",
  "offered",
];

const OTHER_CUSTOM = "Other (custom reason)";
const NO_REASON = "No reason recorded";

/** Preset Hive reasons as-is (case-insensitive); free text → "Other (custom reason)". */
function hiveReasonGroup(raw: string): string {
  if (!raw) return NO_REASON;
  const lower = raw.toLowerCase();
  const preset = [...ADMISSION_REJECTION_REASONS, ...ADMISSION_REJECTION_REASONS_HIDDEN].find(
    (r) => r.toLowerCase() === lower
  );
  return preset ?? OTHER_CUSTOM;
}

function studentReasonGroup(raw: string): string {
  if (!raw) return NO_REASON;
  if (raw.startsWith("Joined elsewhere")) return "Joined elsewhere";
  const preset = STUDENT_REJECTION_REASONS.find((r) => r !== "Custom" && r.toLowerCase() === raw.toLowerCase());
  return preset ?? "Other (custom reason)";
}

function emptyFunnel(schemaPending = false): RejectionFunnel {
  return {
    hiveReasonShares: [],
    studentReasonShares: [],
    hiveCustomReasons: [],
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
  if (
    stage === "student_reject" ||
    stage === "r1_student_reject" ||
    stage === "r2_student_reject" ||
    stage === "r3_student_reject"
  ) {
    return "student";
  }
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
  if (stage.includes("offer") || stage === "student_reject") return "offered";
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

async function fetchRejectionFunnelUncached(
  supabase: SupabaseClient,
  opts: { sinceIso: string; untilExclusiveIso: string }
): Promise<RejectionFunnel> {
  let schemaPending = false;

  // Rejections and offers are dated by when they happened (stage history),
  // not by the lead's last edit — editing a lead used to move its rejection
  // into another month.
  const events = await fetchAllPages<{ lead_id: string; to_stage: string; reason?: string | null }>(
    (from, to) =>
      supabase
        .from("stage_history")
        .select("lead_id, to_stage")
        .in("to_stage", EVENT_STAGES)
        .gte("changed_at", opts.sinceIso)
        .lt("changed_at", opts.untilExclusiveIso)
        .order("changed_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    "reject-events"
  );
  const rejectedIds = Array.from(
    new Set(events.filter((e) => inferRejectKind(e.to_stage)).map((e) => e.lead_id))
  );
  const offeredIds = Array.from(
    new Set(events.filter((e) => e.to_stage === "offered").map((e) => e.lead_id))
  );
  const leadIds = Array.from(new Set([...rejectedIds, ...offeredIds]));

  let leadRows: LeadRejectRow[] = [];
  try {
    leadRows = await mapInChunks(leadIds, async (chunk) => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, stage, reject_kind, reject_at_stage, stage_reason, reject_reason_category")
        .in("id", chunk);
      if (error) throw new Error(error.message);
      return (data ?? []) as LeadRejectRow[];
    });
  } catch (err) {
    if (!isMissingColumnError(err)) throw err;
    schemaPending = true;
    leadRows = await mapInChunks(leadIds, async (chunk) => {
      const { data } = await supabase.from("leads").select("id, stage, stage_reason").in("id", chunk);
      return (data ?? []) as LeadRejectRow[];
    });
  }
  const leadById = new Map(leadRows.map((l) => [l.id, l]));
  // The rejection event (stage entered in range) decides kind and stage;
  // the reason comes from the lead row (history rows carry it from 2 Oct 2026)
  const rejectEvents = new Map<string, string>();
  for (const e of events) if (inferRejectKind(e.to_stage)) rejectEvents.set(e.lead_id, e.to_stage);
  const leads: LeadRejectRow[] = rejectedIds
    .map((id) => {
      const l = leadById.get(id);
      return l ? { ...l, stage: rejectEvents.get(id) ?? l.stage } : null;
    })
    .filter((l): l is LeadRejectRow => !!l);

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

  for (const id of offeredIds) {
    const stageNow = leadById.get(id)?.stage;
    if (stageNow === "offered_accepted" || stageNow === "closed_paid") offeredAccepted += 1;
    else if (stageNow === "student_reject") offeredStudentReject += 1;
    else if (stageNow === "offered") offeredPending += 1;
  }

  const hiveMatrix = new Map<string, Record<string, number>>();
  const studentMatrix = new Map<string, Record<string, number>>();
  const hiveCustom = new Map<string, number>();
  const addMatrix = (m: Map<string, Record<string, number>>, reason: string, stage: string) => {
    const row = m.get(reason) ?? {};
    row[stage] = (row[stage] ?? 0) + 1;
    m.set(reason, row);
  };

  for (const l of leads) {
    const kind = (l.reject_kind as "hive" | "student" | null) || inferRejectKind(l.stage);
    if (!kind) continue;
    const bucket =
      (l.reject_at_stage && stageIndex[l.reject_at_stage] != null
        ? l.reject_at_stage
        : inferRejectAtStage(l.stage)) || "nurturing";
    const idx = stageIndex[bucket] ?? 0;
    const raw = (l.reject_reason_category || l.stage_reason || "").trim();
    if (kind === "hive") {
      hiveTotal += 1;
      byStage[idx].hive += 1;
      const r = (raw || "Unknown").slice(0, 80);
      hiveReasons.set(r, (hiveReasons.get(r) ?? 0) + 1);
      const group = hiveReasonGroup(raw);
      addMatrix(hiveMatrix, group, bucket);
      if (group === OTHER_CUSTOM) hiveCustom.set(raw.slice(0, 80), (hiveCustom.get(raw.slice(0, 80)) ?? 0) + 1);
    } else {
      studentTotal += 1;
      byStage[idx].student += 1;
      const r = (raw || "Unknown").slice(0, 80);
      studentReasons.set(r, (studentReasons.get(r) ?? 0) + 1);
      addMatrix(studentMatrix, studentReasonGroup(raw), bucket);
    }
  }

  let avgProfile: number | null = null;
  let avgIntent: number | null = null;
  try {
    const failed: { error: { message: string } | null } = { error: null };
    const scores = await fetchAllPages<{ profile_score: number; intent_score: number }>(
      (from, to) =>
        supabase
          .from("lead_stage_scores")
          .select("profile_score, intent_score")
          .gte("created_at", opts.sinceIso)
          .lt("created_at", opts.untilExclusiveIso)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true }).range(from, to),
      "lead_stage_scores.rejection"
    ).catch((e: Error) => {
      failed.error = { message: e.message };
      return [] as { profile_score: number; intent_score: number }[];
    });
    const error = failed.error;
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
    const failed: { error: { message: string } | null } = { error: null };
    const noShows = await fetchAllPages<{
      no_show_informed: boolean | null;
      no_show_reason: string | null;
    }>(
      (from, to) =>
        supabase
          .from("interview_bookings")
          .select("no_show_informed, no_show_reason")
          .not("no_show_reason", "is", null)
          .gte("submitted_at", opts.sinceIso)
          .lt("submitted_at", opts.untilExclusiveIso)
          .order("submitted_at", { ascending: true })
          .order("id", { ascending: true }).range(from, to),
      "interview_bookings.noShows"
    ).catch((e: Error) => {
      failed.error = { message: e.message };
      return [] as { no_show_informed: boolean | null; no_show_reason: string | null }[];
    });
    const error = failed.error;
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

  const shares = (m: Map<string, Record<string, number>>, total: number): ReasonShare[] =>
    Array.from(m.entries())
      .map(([reason, byStage]) => {
        const count = Object.values(byStage).reduce((a, b) => a + b, 0);
        return { reason, count, pct: total ? (count / total) * 100 : null, byStage };
      })
      .sort((a, b) => b.count - a.count);

  return {
    hiveReasonShares: shares(hiveMatrix, hiveTotal),
    studentReasonShares: shares(studentMatrix, studentTotal),
    hiveCustomReasons: Array.from(hiveCustom.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
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

const fetchRejectionFunnelCached = cachedAdmissionsQuery(
  "fetchRejectionFunnel-v3-events",
  (opts: Parameters<typeof fetchRejectionFunnelUncached>[1]) => JSON.stringify(opts ?? null),
  (opts: Parameters<typeof fetchRejectionFunnelUncached>[1]) =>
    fetchRejectionFunnelUncached(createAdminClient(), opts)
);

/**
 * Cached ~60s (busted by lead writes). Admin-only callers: runs with the
 * service client because cookies are unavailable inside the cache.
 */
export function fetchRejectionFunnel(
  _supabase: SupabaseClient,
  opts: Parameters<typeof fetchRejectionFunnelUncached>[1]
): Promise<RejectionFunnel> {
  return fetchRejectionFunnelCached(opts);
}
