import type { SupabaseClient } from "@supabase/supabase-js";
import { LOST_STAGES, OPEN_STAGES } from "@/lib/constants";

const LOST_SET = new Set<string>(LOST_STAGES);
import { fetchAllPages } from "@/lib/supabase/paginate";
import { unstable_cache } from "next/cache";
import { istDateKey } from "@/lib/tz";
import { loadFunnelLeadsById } from "@/lib/analytics/funnel-engine";

export type CounselorDashFilters = {
  sinceIso?: string | null;
  untilExclusiveIso?: string | null;
  overall?: boolean;
  courseId?: string | null;
  cohortId?: string | null;
  counselorId?: string | null;
  /**
   * Pipeline columns (R1 / R2 / R3 / offer / rejects / nurturing):
   * cohort   = leads created in the dates, every stage they reached (any time)
   * activity = stage first reached inside the dates (default)
   * Calls are always activity in the dates.
   */
  basis?: "cohort" | "activity";
};

export type CounselorCallingStats = {
  /** Current open allocated stock (Kanban open + scope). Not date-filtered. */
  allocatedLeads: number;
  /** Allocated leads whose created_at falls in the selected date range (any stage). Comparable to Admission Analytics “Total leads”. */
  createdInRangeAllocated: number;
  totalCalls: number;
  avgCallsPerLead: number;
  avgCallsPerDay: number;
  avgCallsPerMonth: number;
  avgConnectedDurationSec: number | null;
  avgCallsPerDayOnDnp: number | null;
  uniqueCallDays: number;
  /** Distinct leads called in range (CE-1) */
  uniqueCalls: number;
  lastCallAt: string | null;
  connectedCalls: number;
  notConnectedCalls: number;
  pickupRatePct: number | null;
  /** Total talk time (seconds) in range */
  totalTalkSec: number;
  /** Average of daily talk totals across days with calls (seconds) */
  avgDailyTalkSec: number | null;
  inboundCalls: number;
  inboundAttended: number;
  inboundAttendPct: number | null;
  outboundCalls: number;
};

export type CounselorPipelineStats = {
  /** Current open allocated stock */
  allocated: number;
  /** Allocated + created in selected date range */
  createdInRangeAllocated: number;
  nurturing: number;
  r1Booked: number;
  r1Conducted: number;
  r1Reject: number;
  r2Booked: number;
  r3Booked: number;
  offer: number;
  studentReject: number;
  hiveReject: number;
  /** Offered in period who reached closed_paid */
  convertedAfterOffer: number;
  /** Offered in period who did not convert */
  notConvertedAfterOffer: number;
  notConvertedAfterOfferPct: number | null;
};

export type CounselorFunnelPct = {
  bookedPct: number | null;
  conductedPct: number | null;
  r2Pct: number | null;
  r3Pct: number | null;
  offeredPct: number | null;
  convertedPct: number | null;
};

export type CounselorRow = {
  counselorId: string;
  name: string;
  calling: CounselorCallingStats;
  pipeline: CounselorPipelineStats;
  /** SC-4: avg of scores this counselor gave */
  avgProfileScore: number | null;
  avgIntentScore: number | null;
};

/**
 * Per counselor (credit = current owner of the lead): leads called in the
 * range, each counted once at the furthest stage it has reached so far.
 * Percentages use total dials as the base (team decision).
 */
export type CounselorOutcomeRow = {
  counselorId: string;
  name: string;
  dials: number;
  leadsCalled: number;
  /** Furthest stage reached — exactly one bucket per lead */
  outcome: {
    r1Booked: number;
    rejected: number;
    closedLost: number;
    dnp: number;
    nurturing: number;
    other: number;
  };
  /** R1 split for leads that reached R1 Booked */
  r1: { booked: number; completed: number; rejected: number; noShow: number; pending: number };
  /** Of the R1 Booked leads, how many reached each later stage */
  fromR1: { r2: number; r3: number; offer: number; convert: number };
};

export type CounselorDashboard = {
  rows: CounselorRow[];
  outcomes: CounselorOutcomeRow[];
  outcomeTotals: CounselorOutcomeRow;
  totals: { calling: CounselorCallingStats; pipeline: CounselorPipelineStats };
  /** Present when a single counselor filter is applied — % of allocated */
  funnelOfAllocated: CounselorFunnelPct | null;
};

function emptyCalling(): CounselorCallingStats {
  return {
    allocatedLeads: 0,
    createdInRangeAllocated: 0,
    totalCalls: 0,
    avgCallsPerLead: 0,
    avgCallsPerDay: 0,
    avgCallsPerMonth: 0,
    avgConnectedDurationSec: null,
    avgCallsPerDayOnDnp: null,
    uniqueCallDays: 0,
    uniqueCalls: 0,
    lastCallAt: null,
    connectedCalls: 0,
    notConnectedCalls: 0,
    pickupRatePct: null,
    totalTalkSec: 0,
    avgDailyTalkSec: null,
    inboundCalls: 0,
    inboundAttended: 0,
    inboundAttendPct: null,
    outboundCalls: 0,
  };
}

function emptyPipeline(): CounselorPipelineStats {
  return {
    allocated: 0,
    createdInRangeAllocated: 0,
    nurturing: 0,
    r1Booked: 0,
    r1Conducted: 0,
    r1Reject: 0,
    r2Booked: 0,
    r3Booked: 0,
    offer: 0,
    studentReject: 0,
    hiveReject: 0,
    convertedAfterOffer: 0,
    notConvertedAfterOffer: 0,
    notConvertedAfterOfferPct: null,
  };
}

function pctOf(n: number, d: number): number | null {
  if (d <= 0) return null;
  return Number(((n / d) * 100).toFixed(1));
}

function dayKey(iso: string) {
  return istDateKey(iso);
}

function filterKey(f: CounselorDashFilters) {
  return [
    f.overall ? "1" : "0",
    f.sinceIso ?? "",
    f.untilExclusiveIso ?? "",
    f.courseId ?? "",
    f.cohortId ?? "",
    f.counselorId ?? "",
    f.basis ?? "activity",
  ].join("|");
}

export async function fetchCounselorDashboardUncached(
  filters: CounselorDashFilters = {}
): Promise<CounselorDashboard> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient();

  const since = filters.overall
    ? "2000-01-01T00:00:00.000Z"
    : filters.sinceIso ?? new Date(Date.now() - 30 * 86400000).toISOString();
  const until = filters.untilExclusiveIso ?? new Date().toISOString();
  const cohortBasis = filters.basis === "cohort";

  const { data: counselors } = await supabase
    .from("users")
    .select("id, name")
    .eq("role", "counselor")
    .eq("active", true)
    .order("name");

  /** Date-scoped activity first (indexed) — avoids giant .in(lead_id) URLs. */
  const [leads, calls, history, scopeRows] = await Promise.all([
    fetchAllPages<{
      id: string;
      lead_allocated_to: string | null;
      stage: string;
      created_at: string;
      cohort_id: string | null;
      course_id: string | null;
    }>(async (from, to) => {
      let q = supabase
        .from("leads")
        .select("id, lead_allocated_to, stage, created_at, cohort_id, course_id")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (filters.courseId) q = q.eq("course_id", filters.courseId);
      if (filters.cohortId) q = q.eq("cohort_id", filters.cohortId);
      return q.range(from, to);
    }, "counselor-leads"),
    fetchAllPages<{
      lead_id: string;
      counselor_id: string;
      logged_at: string;
      duration: number | null;
      outcome: string | null;
      direction: string | null;
    }>(async (from, to) => {
      let q = supabase
        .from("call_logs")
        .select("lead_id, counselor_id, logged_at, duration, outcome, direction")
        .gte("logged_at", since)
        .lt("logged_at", until)
        .order("logged_at", { ascending: true })
        .order("lead_id", { ascending: true });
      if (filters.counselorId) q = q.eq("counselor_id", filters.counselorId);
      const res = await q.order("id", { ascending: true }).range(from, to);
      if (
        res.error &&
        /column .*direction.* does not exist/i.test(res.error.message)
      ) {
        let q2 = supabase
          .from("call_logs")
          .select("lead_id, counselor_id, logged_at, duration, outcome")
          .gte("logged_at", since)
          .lt("logged_at", until)
          .order("logged_at", { ascending: true })
          .order("lead_id", { ascending: true });
        if (filters.counselorId) q2 = q2.eq("counselor_id", filters.counselorId);
        const res2 = await q2.order("id", { ascending: true }).range(from, to);
        return {
          data: (res2.data ?? []).map((r) => ({ ...r, direction: "outbound" as const })),
          error: res2.error,
        };
      }
      return res;
    }, "counselor-calls"),
    fetchAllPages<{
      lead_id: string;
      to_stage: string;
      changed_at: string;
      changed_by: string | null;
    }>((from, to) =>
      // Lead-created basis: every later move of those leads, so no upper bound
      (cohortBasis
        ? supabase.from("stage_history").select("lead_id, to_stage, changed_at, changed_by").gte("changed_at", since)
        : supabase
            .from("stage_history")
            .select("lead_id, to_stage, changed_at, changed_by")
            .gte("changed_at", since)
            .lt("changed_at", until)
      )
        .order("changed_at", { ascending: true })
        .order("lead_id", { ascending: true })
        .order("id", { ascending: true }).range(from, to),
      "counselor-history"
    ),
    supabase
      .from("counselor_scope")
      .select("user_id, course_id, cohort_id")
      .then((r) => r.data ?? []),
  ]);

  const openStageSet = new Set(OPEN_STAGES as readonly string[]);
  const scopesByCounselor = new Map<string, { cohort_id: string; course_id: string }[]>();
  for (const s of scopeRows as { user_id: string; course_id: string; cohort_id: string }[]) {
    const arr = scopesByCounselor.get(s.user_id) ?? [];
    arr.push({ cohort_id: s.cohort_id, course_id: s.course_id });
    scopesByCounselor.set(s.user_id, arr);
  }

  /** Match /leads scope: assigned cohorts + null-cohort leads. Empty scope → none. */
  function leadVisibleToCounselor(
    lead: { cohort_id: string | null; course_id: string | null },
    counselorId: string
  ) {
    const scopes = scopesByCounselor.get(counselorId);
    if (!scopes || scopes.length === 0) return false;
    if (!lead.cohort_id) return true;
    return scopes.some((s) => s.cohort_id === lead.cohort_id);
  }

  const leadSet = new Set(leads.map((l) => l.id));
  const scopedCalls = calls.filter((c) => leadSet.has(c.lead_id));
  const scopedHistory = history.filter((h) => leadSet.has(h.lead_id));

  const rangeDays = Math.max(
    1,
    Math.ceil(
      (new Date(until).getTime() - new Date(since).getTime()) / 86400000
    )
  );
  const rangeMonths = Math.max(1, rangeDays / 30.44);

  const byCounselor = new Map<string, CounselorRow>();
  for (const c of counselors ?? []) {
    if (filters.counselorId && c.id !== filters.counselorId) continue;
    byCounselor.set(c.id, {
      counselorId: c.id,
      name: c.name,
      calling: emptyCalling(),
      pipeline: emptyPipeline(),
      avgProfileScore: null,
      avgIntentScore: null,
    });
  }

  const leadsByCounselor = new Map<string, typeof leads>();
  const createdInRangeByCounselor = new Map<string, number>();

  for (const l of leads) {
    if (!l.lead_allocated_to) continue;
    // Counselor filter: only that counselor's leads (other owners used to be
    // added as extra rows, so the totals never changed — team, 6 Oct)
    if (filters.counselorId && l.lead_allocated_to !== filters.counselorId) continue;

    // Created-in-range allocated (any stage) — comparable to Analytics “Total leads”
    const createdAt = l.created_at || "";
    const inRange =
      filters.overall ||
      (createdAt >= since && createdAt < until);
    if (inRange) {
      createdInRangeByCounselor.set(
        l.lead_allocated_to,
        (createdInRangeByCounselor.get(l.lead_allocated_to) ?? 0) + 1
      );
    }

    // Open stock mirrors the counselor's Kanban: open stages inside their scope
    if (!openStageSet.has(l.stage)) continue;
    if (!leadVisibleToCounselor(l, l.lead_allocated_to)) continue;
    const arr = leadsByCounselor.get(l.lead_allocated_to) ?? [];
    arr.push(l);
    leadsByCounselor.set(l.lead_allocated_to, arr);
  }

  const dnpLeadIds = new Set(
    leads.filter((l) => l.stage === "dnp").map((l) => l.id)
  );

  for (const [cid, mine] of Array.from(leadsByCounselor.entries())) {
    let row = byCounselor.get(cid);
    if (!row) {
      row = {
        counselorId: cid,
        name: "Unknown",
        calling: emptyCalling(),
        pipeline: emptyPipeline(),
        avgProfileScore: null,
        avgIntentScore: null,
      };
      byCounselor.set(cid, row);
    }
    row.pipeline.allocated = mine.length;
    row.calling.allocatedLeads = mine.length;
  }

  for (const [cid, n] of Array.from(createdInRangeByCounselor.entries())) {
    let row = byCounselor.get(cid);
    if (!row) {
      row = {
        counselorId: cid,
        name: "Unknown",
        calling: emptyCalling(),
        pipeline: emptyPipeline(),
        avgProfileScore: null,
        avgIntentScore: null,
      };
      byCounselor.set(cid, row);
    }
    row.calling.createdInRangeAllocated = n;
    row.pipeline.createdInRangeAllocated = n;
  }

  // R1 / R2 / R3 / offer / convert: first time reached, inside the range —
  // same definitions as the marketing funnel (shared engine)
  const inRangeIso = (iso: string | undefined) => !!iso && iso >= since && iso < until;
  const createdInRange = new Set(
    leads.filter((l) => filters.overall || inRangeIso(l.created_at)).map((l) => l.id)
  );
  // activity: reached inside the dates · cohort: lead created in the dates, reached any time
  const counts = (id: string, at: string | undefined) =>
    cohortBasis ? createdInRange.has(id) && !!at : inRangeIso(at);
  const funnelIds = Array.from(
    new Set([
      ...scopedHistory.map((h) => h.lead_id),
      ...Array.from(createdInRange),
      ...scopedCalls.map((c) => c.lead_id),
    ])
  );
  const funnelLeads = await loadFunnelLeadsById(supabase, funnelIds);
  const r1Booked = new Set<string>();
  const r1Conducted = new Set<string>();
  const r2Booked = new Set<string>();
  const r3Booked = new Set<string>();
  const offered = new Set<string>();
  const converted = new Set<string>();
  for (const f of funnelLeads) {
    if (counts(f.id, f.at.r1Booked)) r1Booked.add(f.id);
    if (counts(f.id, f.at.r1Completed)) r1Conducted.add(f.id);
    if (counts(f.id, f.at.r2Booked)) r2Booked.add(f.id);
    if (counts(f.id, f.at.r3Booked)) r3Booked.add(f.id);
    if (counts(f.id, f.at.offer)) offered.add(f.id);
    if (f.at.convert) converted.add(f.id);
  }

  // Entered the stage inside the range (no all-time current-stage top-up —
  // that mixed "ever" with "this period" and inflated these columns)
  const r1Reject = new Set<string>();
  const studentReject = new Set<string>();
  const hiveReject = new Set<string>();
  const nurturing = new Set<string>();
  for (const h of scopedHistory) {
    if (cohortBasis ? !createdInRange.has(h.lead_id) : !inRangeIso(h.changed_at)) continue;
    if (h.to_stage === "r1_reject") r1Reject.add(h.lead_id);
    if (
      h.to_stage === "student_reject" ||
      h.to_stage === "r1_student_reject" ||
      h.to_stage === "r2_student_reject" ||
      h.to_stage === "r3_student_reject"
    ) {
      studentReject.add(h.lead_id);
    }
    if (
      h.to_stage === "admission_team_rejected" ||
      h.to_stage === "r1_reject" ||
      h.to_stage === "r2_reject" ||
      h.to_stage === "r3_reject"
    ) {
      hiveReject.add(h.lead_id);
    }
    if (h.to_stage === "call_logged_nurturing") nurturing.add(h.lead_id);
  }

  const leadOwner = new Map(leads.map((l) => [l.id, l.lead_allocated_to]));
  for (const row of Array.from(byCounselor.values())) {
    row.pipeline.nurturing = 0;
    row.pipeline.r1Booked = 0;
    row.pipeline.r1Conducted = 0;
    row.pipeline.r1Reject = 0;
    row.pipeline.r2Booked = 0;
    row.pipeline.r3Booked = 0;
    row.pipeline.offer = 0;
    row.pipeline.studentReject = 0;
    row.pipeline.hiveReject = 0;
    row.pipeline.convertedAfterOffer = 0;
    row.pipeline.notConvertedAfterOffer = 0;
    row.pipeline.notConvertedAfterOfferPct = null;
  }
  const bump = (set: Set<string>, field: keyof CounselorPipelineStats) => {
    for (const lid of Array.from(set)) {
      const oid = leadOwner.get(lid);
      if (!oid) continue;
      const row = byCounselor.get(oid);
      if (
        !row ||
        field === "allocated" ||
        field === "convertedAfterOffer" ||
        field === "notConvertedAfterOffer" ||
        field === "notConvertedAfterOfferPct"
      )
        continue;
      (row.pipeline[field] as number) += 1;
    }
  };
  bump(nurturing, "nurturing");
  // R1 booked goes to the counselor who booked it (first move into R1 Booked);
  // an admin booking, or no history row, falls back to the lead's owner.
  const counselorIds = new Set((counselors ?? []).map((c) => c.id));
  const r1BookedBy = new Map<string, string>();
  for (const h of scopedHistory) {
    if (h.to_stage === "r1_booked" && h.changed_by && !r1BookedBy.has(h.lead_id)) {
      r1BookedBy.set(h.lead_id, h.changed_by);
    }
  }
  for (const lid of Array.from(r1Booked)) {
    const by = r1BookedBy.get(lid);
    // Booked by a counselor → theirs (even when the filter hides them); else the owner's
    const cid = by && counselorIds.has(by) ? by : leadOwner.get(lid);
    const row = cid ? byCounselor.get(cid) : undefined;
    if (row) row.pipeline.r1Booked += 1;
  }
  bump(r1Conducted, "r1Conducted");
  bump(r1Reject, "r1Reject");
  bump(r2Booked, "r2Booked");
  bump(r3Booked, "r3Booked");
  bump(offered, "offer");
  bump(studentReject, "studentReject");
  bump(hiveReject, "hiveReject");

  for (const lid of Array.from(offered)) {
    const oid = leadOwner.get(lid);
    if (!oid) continue;
    const row = byCounselor.get(oid);
    if (!row) continue;
    if (converted.has(lid)) row.pipeline.convertedAfterOffer += 1;
    else row.pipeline.notConvertedAfterOffer += 1;
  }
  for (const row of Array.from(byCounselor.values())) {
    const offeredN = row.pipeline.offer;
    row.pipeline.notConvertedAfterOfferPct = pctOf(
      row.pipeline.notConvertedAfterOffer,
      offeredN
    );
  }
  const callsByCounselor = new Map<string, typeof scopedCalls>();
  for (const c of scopedCalls) {
    const arr = callsByCounselor.get(c.counselor_id) ?? [];
    arr.push(c);
    callsByCounselor.set(c.counselor_id, arr);
  }

  for (const [cid, mine] of Array.from(callsByCounselor.entries())) {
    const row = byCounselor.get(cid);
    if (!row) continue;
    const uniqueDays = new Set(mine.map((c) => dayKey(c.logged_at)));
    const uniqueLeads = new Set(mine.map((c) => c.lead_id));
    const connected = mine.filter((c) => {
      const o = (c.outcome || "").toLowerCase();
      return (
        o === "connected" ||
        o === "completed" ||
        (c.duration != null && c.duration > 0)
      );
    });
    const dnpCalls = mine.filter((c) => dnpLeadIds.has(c.lead_id));
    const dnpDays = new Set(dnpCalls.map((c) => dayKey(c.logged_at)));
    const talkByDay = new Map<string, number>();
    for (const c of connected) {
      const d = dayKey(c.logged_at);
      talkByDay.set(d, (talkByDay.get(d) ?? 0) + (c.duration || 0));
    }
    const dailyTalks = Array.from(talkByDay.values());
    const totalTalk = dailyTalks.reduce((s, n) => s + n, 0);
    const inbound = mine.filter((c) => c.direction === "inbound");
    const inboundAttended = inbound.filter((c) => {
      const o = (c.outcome || "").toLowerCase();
      return o === "connected" || o === "completed" || (c.duration ?? 0) > 0;
    });

    row.calling.totalCalls = mine.length;
    row.calling.uniqueCalls = uniqueLeads.size;
    row.calling.lastCallAt = mine.length > 0 ? mine[mine.length - 1].logged_at : null;
    row.calling.uniqueCallDays = uniqueDays.size;
    row.calling.connectedCalls = connected.length;
    row.calling.notConnectedCalls = Math.max(0, mine.length - connected.length);
    row.calling.pickupRatePct =
      mine.length > 0
        ? Number(((connected.length / mine.length) * 100).toFixed(1))
        : null;
    row.calling.totalTalkSec = totalTalk;
    row.calling.avgDailyTalkSec = dailyTalks.length
      ? Math.round(totalTalk / dailyTalks.length)
      : null;
    row.calling.inboundCalls = inbound.length;
    row.calling.inboundAttended = inboundAttended.length;
    row.calling.inboundAttendPct =
      inbound.length > 0
        ? Number(((inboundAttended.length / inbound.length) * 100).toFixed(1))
        : null;
    row.calling.outboundCalls = mine.length - inbound.length;
    row.calling.avgCallsPerLead =
      uniqueLeads.size > 0 ? Number((mine.length / uniqueLeads.size).toFixed(2)) : 0;
    row.calling.avgCallsPerDay = Number((mine.length / rangeDays).toFixed(2));
    row.calling.avgCallsPerMonth = Number(
      (mine.length / rangeMonths).toFixed(2)
    );
    if (connected.length) {
      const sum = connected.reduce((s, c) => s + (c.duration || 0), 0);
      row.calling.avgConnectedDurationSec = Math.round(sum / connected.length);
    }
    if (dnpLeadIds.size && dnpDays.size) {
      row.calling.avgCallsPerDayOnDnp = Number(
        (dnpCalls.length / Math.max(1, dnpDays.size)).toFixed(2)
      );
    }
  }

  // SC-4: average profile/intent scores given by each counselor
  const scorerIds = Array.from(byCounselor.keys());
  if (scorerIds.length) {
    const scoreRows = await fetchAllPages<{
      scored_by: string;
      profile_score: number;
      intent_score: number;
    }>((from, to) => {
      const q = supabase
        .from("lead_stage_scores")
        .select("scored_by, profile_score, intent_score")
        .in("scored_by", scorerIds)
        .gte("created_at", since)
        .lt("created_at", until)
        .order("created_at", { ascending: true });
      return q.order("id", { ascending: true }).range(from, to);
    }, "counselor-scores").catch(() => [] as { scored_by: string; profile_score: number; intent_score: number }[]);

    const byScorer = new Map<string, { p: number[]; i: number[] }>();
    for (const s of scoreRows) {
      const cur = byScorer.get(s.scored_by) ?? { p: [], i: [] };
      cur.p.push(s.profile_score);
      cur.i.push(s.intent_score);
      byScorer.set(s.scored_by, cur);
    }
    for (const [cid, vals] of Array.from(byScorer.entries())) {
      const row = byCounselor.get(cid);
      if (!row || !vals.p.length) continue;
      row.avgProfileScore = Number(
        (vals.p.reduce((a, b) => a + b, 0) / vals.p.length).toFixed(2)
      );
      row.avgIntentScore = Number(
        (vals.i.reduce((a, b) => a + b, 0) / vals.i.length).toFixed(2)
      );
    }
  }

  const funnelById = new Map(funnelLeads.map((f) => [f.id, f]));
  const outcomeBy = new Map<string, CounselorOutcomeRow>();
  const emptyOutcome = (counselorId: string, name: string): CounselorOutcomeRow => ({
    counselorId,
    name,
    dials: 0,
    leadsCalled: 0,
    outcome: { r1Booked: 0, rejected: 0, closedLost: 0, dnp: 0, nurturing: 0, other: 0 },
    r1: { booked: 0, completed: 0, rejected: 0, noShow: 0, pending: 0 },
    fromR1: { r2: 0, r3: 0, offer: 0, convert: 0 },
  });
  // Credited to the counselor who made the call (was the lead's current owner,
  // so a counselor's dials and unique leads didn't match their own call log)
  const calledByOwner = new Map<string, Set<string>>();
  for (const c of scopedCalls) {
    const owner = c.counselor_id;
    if (!owner || !byCounselor.has(owner)) continue;
    let o = outcomeBy.get(owner);
    if (!o) {
      o = emptyOutcome(owner, byCounselor.get(owner)?.name ?? "Unknown");
      outcomeBy.set(owner, o);
    }
    o.dials += 1;
    const set = calledByOwner.get(owner) ?? new Set<string>();
    set.add(c.lead_id);
    calledByOwner.set(owner, set);
  }
  for (const [owner, ids] of Array.from(calledByOwner.entries())) {
    const o = outcomeBy.get(owner)!;
    for (const id of Array.from(ids)) {
      const f = funnelById.get(id);
      if (!f) continue;
      o.leadsCalled += 1;
      const ever = new Set(f.stagesEver);
      if (f.at.r1Booked) {
        o.outcome.r1Booked += 1;
        o.r1.booked += 1;
        if (ever.has("r1_reject")) o.r1.rejected += 1;
        if (f.at.r1Completed) o.r1.completed += 1;
        else if (ever.has("r1_no_show")) o.r1.noShow += 1;
        else o.r1.pending += 1;
        if (f.at.r2Booked) o.fromR1.r2 += 1;
        if (f.at.r3Booked) o.fromR1.r3 += 1;
        if (f.at.offer) o.fromR1.offer += 1;
        if (f.at.convert) o.fromR1.convert += 1;
      } else if (f.stage === "admission_team_rejected") {
        o.outcome.rejected += 1;
      } else if (LOST_SET.has(f.stage)) {
        o.outcome.closedLost += 1;
      } else if (f.stage === "dnp" || f.stage === "dnp_whatsapp_replied" || f.stage === "no_show" || f.stage === "reschedule") {
        o.outcome.dnp += 1;
      } else if (f.stage === "call_logged_nurturing") {
        o.outcome.nurturing += 1;
      } else {
        o.outcome.other += 1;
      }
    }
  }
  const outcomes = Array.from(outcomeBy.values()).sort((a, b) => a.name.localeCompare(b.name));
  const outcomeTotals = emptyOutcome("all", "All counselors");
  for (const o of outcomes) {
    outcomeTotals.dials += o.dials;
    outcomeTotals.leadsCalled += o.leadsCalled;
    for (const k of Object.keys(o.outcome) as (keyof CounselorOutcomeRow["outcome"])[]) {
      outcomeTotals.outcome[k] += o.outcome[k];
    }
    for (const k of Object.keys(o.r1) as (keyof CounselorOutcomeRow["r1"])[]) outcomeTotals.r1[k] += o.r1[k];
    for (const k of Object.keys(o.fromR1) as (keyof CounselorOutcomeRow["fromR1"])[]) {
      outcomeTotals.fromR1[k] += o.fromR1[k];
    }
  }

  const rows = Array.from(byCounselor.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const totals = {
    calling: emptyCalling(),
    pipeline: emptyPipeline(),
  };
  for (const r of rows) {
    totals.calling.allocatedLeads += r.calling.allocatedLeads;
    totals.calling.createdInRangeAllocated += r.calling.createdInRangeAllocated;
    totals.calling.totalCalls += r.calling.totalCalls;
    totals.calling.uniqueCalls += r.calling.uniqueCalls;
    totals.calling.uniqueCallDays += r.calling.uniqueCallDays;
    totals.calling.connectedCalls += r.calling.connectedCalls;
    totals.calling.notConnectedCalls += r.calling.notConnectedCalls;
    totals.calling.totalTalkSec += r.calling.totalTalkSec;
    totals.calling.inboundCalls += r.calling.inboundCalls;
    totals.calling.inboundAttended += r.calling.inboundAttended;
    totals.calling.outboundCalls += r.calling.outboundCalls;
    totals.pipeline.allocated += r.pipeline.allocated;
    totals.pipeline.createdInRangeAllocated += r.pipeline.createdInRangeAllocated;
    totals.pipeline.nurturing += r.pipeline.nurturing;
    totals.pipeline.r1Booked += r.pipeline.r1Booked;
    totals.pipeline.r1Conducted += r.pipeline.r1Conducted;
    totals.pipeline.r1Reject += r.pipeline.r1Reject;
    totals.pipeline.r2Booked += r.pipeline.r2Booked;
    totals.pipeline.r3Booked += r.pipeline.r3Booked;
    totals.pipeline.offer += r.pipeline.offer;
    totals.pipeline.studentReject += r.pipeline.studentReject;
    totals.pipeline.hiveReject += r.pipeline.hiveReject;
    totals.pipeline.convertedAfterOffer += r.pipeline.convertedAfterOffer;
    totals.pipeline.notConvertedAfterOffer += r.pipeline.notConvertedAfterOffer;
  }
  totals.pipeline.notConvertedAfterOfferPct = pctOf(
    totals.pipeline.notConvertedAfterOffer,
    totals.pipeline.offer
  );
  totals.calling.avgCallsPerLead =
    totals.calling.uniqueCalls > 0
      ? Number((totals.calling.totalCalls / totals.calling.uniqueCalls).toFixed(2))
      : 0;
  totals.calling.avgCallsPerDay = Number(
    (totals.calling.totalCalls / rangeDays).toFixed(2)
  );
  totals.calling.avgCallsPerMonth = Number(
    (totals.calling.totalCalls / rangeMonths).toFixed(2)
  );
  totals.calling.pickupRatePct =
    totals.calling.totalCalls > 0
      ? Number(
          (
            (totals.calling.connectedCalls / totals.calling.totalCalls) *
            100
          ).toFixed(1)
        )
      : null;
  totals.calling.inboundAttendPct =
    totals.calling.inboundCalls > 0
      ? Number(
          (
            (totals.calling.inboundAttended / totals.calling.inboundCalls) *
            100
          ).toFixed(1)
        )
      : null;
  const talkDays = rows.filter((r) => r.calling.avgDailyTalkSec != null);
  totals.calling.avgDailyTalkSec = talkDays.length
    ? Math.round(
        talkDays.reduce((s, r) => s + (r.calling.avgDailyTalkSec || 0), 0) /
          talkDays.length
      )
    : null;

  const funnelOfAllocated: CounselorFunnelPct | null = filters.counselorId
    ? (() => {
        const p = totals.pipeline;
        const d = p.allocated;
        return {
          bookedPct: pctOf(p.r1Booked, d),
          conductedPct: pctOf(p.r1Conducted, d),
          r2Pct: pctOf(p.r2Booked, d),
          r3Pct: pctOf(p.r3Booked, d),
          offeredPct: pctOf(p.offer, d),
          convertedPct: pctOf(p.convertedAfterOffer, d),
        };
      })()
    : null;

  return { rows, totals, funnelOfAllocated, outcomes, outcomeTotals };
}

export async function fetchCounselorDashboard(
  _supabase: SupabaseClient,
  filters: CounselorDashFilters = {}
): Promise<CounselorDashboard> {
  const key = filterKey(filters);
  return unstable_cache(
    () => fetchCounselorDashboardUncached(filters),
    ["counselor-dashboard-v4-engine", (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 12), key],
    { revalidate: 60, tags: ["counselor-dashboard"] }
  )();
}
