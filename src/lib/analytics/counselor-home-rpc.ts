import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ATTENTION_STAGES,
  emptyDailyBetween,
  fetchAdmissionsAnalytics,
  type AdmissionsAnalytics,
} from "@/lib/analytics/admissions";
import { resolveAnalyticsRange } from "@/lib/analytics/date-range";
import {
  LOST_STAGES,
  OPEN_STAGES,
  STAGE_GROUPS,
  STAGE_LABELS,
  type Stage,
} from "@/lib/constants";
import { labelForLeadSource } from "@/lib/leads/form-origin";
import {
  fetchCounselorAttributionGlance,
  summarizeCounselorAttribution,
} from "@/lib/marketing/queries";
import { istMidnight } from "@/lib/tz";

type Count<K extends string> = { [P in K]: string | null } & { count: number };

type RpcPayload = {
  total_leads: number;
  unassigned: number;
  stage_counts: Count<"stage">[];
  source_counts: Count<"source">[];
  course_counts: Count<"course_id">[];
  counselor_stage_counts: (Count<"counselor_id"> & { stage: string })[];
  daily_leads: Count<"date">[];
  daily_won: Count<"date">[];
  calls_total: number;
  daily_calls: Count<"date">[];
  calls_by_counselor: Count<"counselor_id">[];
  recent_leads: {
    id: string;
    name: string;
    stage: string;
    source: string | null;
    created_at: string;
    lead_allocated_to: string | null;
  }[];
  attention_list: { id: string; name: string; stage: string }[];
  interviews_upcoming: number;
  interviews_today: {
    id: string;
    scheduled_at: string;
    round: string;
    meet_link: string | null;
    lead_name: string;
  }[];
  attributions: {
    lead_id: string;
    converted_at: string;
    first_touch_campaign_id: string | null;
  }[];
};

export type CounselorHomeData = Omit<AdmissionsAnalytics, "leadRows" | "callRows"> & {
  attribution: Awaited<ReturnType<typeof summarizeCounselorAttribution>>;
};

/** Sort by count desc; ties by name so output is deterministic. */
function byCount<T extends { name: string; count: number }>(rows: T[]): T[] {
  return rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Counselor home via rpc_counselor_home — one round-trip instead of paging
 * every lead / booking / call into Node. Produces the same numbers as
 * fetchAdmissionsAnalytics({ lite: true }) + fetchCounselorAttributionGlance.
 * Throws if the RPC is missing or errors (caller falls back).
 */
export async function fetchCounselorHomeViaRpc(
  db: SupabaseClient,
  counselorId: string | null,
  rangeDays: number
): Promise<CounselorHomeData> {
  const range = resolveAnalyticsRange({ rangeDays });
  const { fromDate, toDate, sinceIso, untilExclusiveIso } = range;

  // Same windows as fetchAdmissionsAnalytics (server-local midnight, +30d base buffer)
  // Midnight IST (server runs in UTC; IST has no DST so +N days is exact)
  const today = istMidnight();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const weekAhead = new Date(today.getTime() + 7 * 86_400_000);
  const baseSince = new Date(sinceIso);
  baseSince.setUTCDate(baseSince.getUTCDate() - 30);

  const [rpcRes, coursesRes, counselorsRes] = await Promise.all([
    db.rpc("rpc_counselor_home_v2", {
      p_counselor_id: counselorId,
      p_base_since: baseSince.toISOString(),
      p_since: sinceIso,
      p_until: untilExclusiveIso,
      p_today: today.toISOString(),
      p_tomorrow: tomorrow.toISOString(),
      p_week_ahead: weekAhead.toISOString(),
      p_attention_stages: [...ATTENTION_STAGES],
    }),
    db.from("courses").select("id, name").eq("active", true),
    db.from("users").select("id, name").eq("role", "counselor").eq("active", true),
  ]);
  if (rpcRes.error) throw new Error(`rpc_counselor_home_v2: ${rpcRes.error.message}`);
  const r = rpcRes.data as RpcPayload;

  const courses = (coursesRes.data ?? []) as { id: string; name: string }[];
  const counselors = (counselorsRes.data ?? []) as { id: string; name: string }[];
  const courseMap = new Map(courses.map((c) => [c.id, c.name]));
  const counselorMap = new Map(counselors.map((c) => [c.id, c.name]));

  const stageCount = new Map(r.stage_counts.map((s) => [s.stage as string, s.count]));
  const countStages = (stages: readonly string[]) =>
    stages.reduce((n, st) => n + (stageCount.get(st) ?? 0), 0);

  const openLeads = countStages(OPEN_STAGES);
  const newLeads = countStages(["new_lead", "lead_created", "call_logged_nurturing"]);
  const attentionLeads = countStages(ATTENTION_STAGES);
  const won = stageCount.get("closed_paid") ?? 0;
  const lost = countStages(LOST_STAGES);
  const closed = won + lost;

  const funnelGroups = [
    ...STAGE_GROUPS.filter((g) => !["open", "all"].includes(g.id)),
    { id: "won", label: "Closed Won", stages: ["closed_paid"] as Stage[] },
    { id: "lost", label: "Closed Lost", stages: [...LOST_STAGES] as Stage[] },
  ].map((g) => ({ name: g.label, count: countStages(g.stages) }));

  const stageBreakdown = byCount(
    r.stage_counts.map((s) => ({
      name: STAGE_LABELS[s.stage as Stage] ?? (s.stage as string),
      count: s.count,
      id: s.stage as string,
    }))
  );

  const sourceCounts = new Map<string, number>();
  for (const s of r.source_counts) {
    const label = labelForLeadSource(s.source);
    sourceCounts.set(label, (sourceCounts.get(label) ?? 0) + s.count);
  }
  const sourceMix = byCount(
    Array.from(sourceCounts.entries()).map(([name, count]) => ({ name, count }))
  ).slice(0, 12);

  const courseCounts = new Map<string, number>();
  for (const c of r.course_counts) {
    const name = c.course_id
      ? courseMap.get(c.course_id) ?? "Unknown course"
      : "Unassigned course";
    courseCounts.set(name, (courseCounts.get(name) ?? 0) + c.count);
  }
  const courseMix = byCount(
    Array.from(courseCounts.entries()).map(([name, count]) => ({ name, count }))
  );

  const callsByCounselor = new Map(
    r.calls_by_counselor.map((c) => [c.counselor_id as string, c.count])
  );
  const boardCounselors = counselorId
    ? counselors.filter((c) => c.id === counselorId)
    : counselors;
  const counselorBoard = boardCounselors
    .map((c) => {
      const mine = r.counselor_stage_counts.filter((x) => x.counselor_id === c.id);
      const n = (stages?: readonly string[]) =>
        mine
          .filter((x) => !stages || stages.includes(x.stage))
          .reduce((s, x) => s + x.count, 0);
      const cWon = n(["closed_paid"]);
      const cLost = n(LOST_STAGES);
      return {
        id: c.id,
        name: c.name,
        total: n(),
        open: n(OPEN_STAGES),
        won: cWon,
        lost: cLost,
        attention: n(ATTENTION_STAGES),
        winRate: cWon + cLost ? (cWon / (cWon + cLost)) * 100 : 0,
        calls: callsByCounselor.get(c.id) ?? 0,
      };
    })
    .sort((a, b) => b.total - a.total);

  const daily = emptyDailyBetween(fromDate, toDate);
  const dailyMap = new Map(daily.map((d) => [d.date, d]));
  for (const d of r.daily_leads) {
    const row = dailyMap.get(d.date as string);
    if (row) row.leads += d.count;
  }
  for (const d of r.daily_won) {
    const row = dailyMap.get(d.date as string);
    if (row) row.won += d.count;
  }
  for (const d of r.daily_calls) {
    const row = dailyMap.get(d.date as string);
    if (row) row.calls += d.count;
  }

  const interviewsToday = r.interviews_today.map((iv) => ({
    id: iv.id,
    scheduled_at: iv.scheduled_at,
    round: iv.round,
    meet_link: iv.meet_link,
    leadName: iv.lead_name ?? "Lead",
  }));

  const attribution = await summarizeCounselorAttribution(
    db,
    r.attributions,
    r.total_leads
  );

  return {
    rangeDays: range.rangeDays,
    fromDate,
    toDate,
    kpis: {
      totalLeads: r.total_leads,
      openLeads,
      newLeads,
      attentionLeads,
      won,
      lost,
      winRate: closed ? (won / closed) * 100 : 0,
      unassigned: r.unassigned,
      attributed: 0,
      interviewsToday: interviewsToday.length,
      interviewsUpcoming: r.interviews_upcoming,
      callsInRange: r.calls_total,
      feeCollected: 0,
      feeOutstanding: 0,
      sessionsInRange: 0,
      formConversionsInRange: 0,
    },
    funnelGroups,
    stageBreakdown,
    sourceMix,
    courseMix,
    counselorBoard,
    daily,
    recentLeads: r.recent_leads.map((l) => ({
      id: l.id,
      name: l.name,
      stage: l.stage,
      source: l.source,
      created_at: l.created_at,
      counselor: l.lead_allocated_to
        ? counselorMap.get(l.lead_allocated_to) ?? null
        : null,
    })),
    attentionList: r.attention_list,
    interviewsToday,
    paymentModeMix: [],
    vendorLoanStats: [],
    attribution,
  };
}

/** Original path: page rows into Node and aggregate in JS. */
export async function fetchCounselorHomeLegacy(
  db: SupabaseClient,
  counselorId: string | null,
  rangeDays: number
): Promise<CounselorHomeData> {
  const data = await fetchAdmissionsAnalytics(db, { counselorId, rangeDays, lite: true });
  const attribution = await fetchCounselorAttributionGlance(
    db,
    data.leadRows.map((l) => l.id)
  );
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { leadRows, callRows, ...rest } = data;
  return { ...rest, attribution };
}
