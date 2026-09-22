import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/supabase/paginate";
import { unstable_cache } from "next/cache";

export type CounselorDashFilters = {
  sinceIso?: string | null;
  untilExclusiveIso?: string | null;
  overall?: boolean;
  courseId?: string | null;
  cohortId?: string | null;
  counselorId?: string | null;
};

export type CounselorCallingStats = {
  allocatedLeads: number;
  totalCalls: number;
  avgCallsPerLead: number;
  avgCallsPerDay: number;
  avgCallsPerMonth: number;
  avgConnectedDurationSec: number | null;
  avgCallsPerDayOnDnp: number | null;
  uniqueCallDays: number;
  /** Distinct leads called in range (CE-1) */
  uniqueCalls: number;
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
  allocated: number;
  nurturing: number;
  r1Booked: number;
  r1Conducted: number;
  r1Reject: number;
  r2Booked: number;
  r3Booked: number;
  offer: number;
  studentReject: number;
  hiveReject: number;
  /** Offered in period who reached closed_paid / offered_accepted */
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
};

export type CounselorDashboard = {
  rows: CounselorRow[];
  totals: { calling: CounselorCallingStats; pipeline: CounselorPipelineStats };
  /** Present when a single counselor filter is applied — % of allocated */
  funnelOfAllocated: CounselorFunnelPct | null;
};

function emptyCalling(): CounselorCallingStats {
  return {
    allocatedLeads: 0,
    totalCalls: 0,
    avgCallsPerLead: 0,
    avgCallsPerDay: 0,
    avgCallsPerMonth: 0,
    avgConnectedDurationSec: null,
    avgCallsPerDayOnDnp: null,
    uniqueCallDays: 0,
    uniqueCalls: 0,
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
  return iso.slice(0, 10);
}

function filterKey(f: CounselorDashFilters) {
  return [
    f.overall ? "1" : "0",
    f.sinceIso ?? "",
    f.untilExclusiveIso ?? "",
    f.courseId ?? "",
    f.cohortId ?? "",
    f.counselorId ?? "",
  ].join("|");
}

async function fetchCounselorDashboardUncached(
  filters: CounselorDashFilters = {}
): Promise<CounselorDashboard> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient();

  const since = filters.overall
    ? "2000-01-01T00:00:00.000Z"
    : filters.sinceIso ?? new Date(Date.now() - 30 * 86400000).toISOString();
  const until = filters.untilExclusiveIso ?? new Date().toISOString();

  const { data: counselors } = await supabase
    .from("users")
    .select("id, name")
    .eq("role", "counselor")
    .eq("active", true)
    .order("name");

  /** Date-scoped activity first (indexed) — avoids giant .in(lead_id) URLs. */
  const [leads, calls, history] = await Promise.all([
    fetchAllPages<{
      id: string;
      lead_allocated_to: string | null;
      stage: string;
      created_at: string;
    }>(async (from, to) => {
      let q = supabase
        .from("leads")
        .select("id, lead_allocated_to, stage, created_at")
        .order("created_at", { ascending: true });
      if (filters.courseId) q = q.eq("course_id", filters.courseId);
      if (filters.cohortId) q = q.eq("cohort_id", filters.cohortId);
      if (filters.counselorId) q = q.eq("lead_allocated_to", filters.counselorId);
      return q.range(from, to);
    }, "counselor-leads"),
    fetchAllPages<{
      lead_id: string;
      counselor_id: string;
      logged_at: string;
      duration: number | null;
      outcome: string | null;
      direction: string | null;
    }>((from, to) => {
      let q = supabase
        .from("call_logs")
        .select("lead_id, counselor_id, logged_at, duration, outcome, direction")
        .gte("logged_at", since)
        .lt("logged_at", until)
        .order("logged_at", { ascending: true });
      if (filters.counselorId) q = q.eq("counselor_id", filters.counselorId);
      return q.range(from, to);
    }, "counselor-calls"),
    fetchAllPages<{
      lead_id: string;
      to_stage: string;
      changed_at: string;
    }>((from, to) =>
      supabase
        .from("stage_history")
        .select("lead_id, to_stage, changed_at")
        .gte("changed_at", since)
        .lt("changed_at", until)
        .order("changed_at", { ascending: true })
        .range(from, to),
      "counselor-history"
    ),
  ]);

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
    });
  }

  const leadsByCounselor = new Map<string, typeof leads>();
  for (const l of leads) {
    if (!l.lead_allocated_to) continue;
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
      };
      byCounselor.set(cid, row);
    }
    row.pipeline.allocated = mine.length;
    row.calling.allocatedLeads = mine.length;
  }

  const r1Booked = new Set<string>();
  const r1Conducted = new Set<string>();
  const r1Reject = new Set<string>();
  const r2Booked = new Set<string>();
  const r3Booked = new Set<string>();
  const offered = new Set<string>();
  const converted = new Set<string>();
  const studentReject = new Set<string>();
  const hiveReject = new Set<string>();
  const nurturing = new Set<string>();
  for (const h of scopedHistory) {
    if (h.to_stage === "r1_booked") r1Booked.add(h.lead_id);
    if (
      h.to_stage === "r1_confirmed" ||
      h.to_stage === "r2_booked" ||
      h.to_stage === "r2_tbb"
    ) {
      r1Conducted.add(h.lead_id);
    }
    if (h.to_stage === "r1_reject") r1Reject.add(h.lead_id);
    if (h.to_stage === "r2_booked") r2Booked.add(h.lead_id);
    if (h.to_stage === "r3_booked") r3Booked.add(h.lead_id);
    if (h.to_stage === "offered" || h.to_stage === "yet_to_offer") {
      offered.add(h.lead_id);
    }
    if (h.to_stage === "closed_paid" || h.to_stage === "offered_accepted") {
      converted.add(h.lead_id);
    }
    if (h.to_stage === "student_reject") studentReject.add(h.lead_id);
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
  for (const l of leads) {
    if (l.stage === "call_logged_nurturing") nurturing.add(l.id);
    if (l.stage === "student_reject") studentReject.add(l.id);
    if (
      l.stage === "admission_team_rejected" ||
      l.stage === "r1_reject" ||
      l.stage === "r2_reject" ||
      l.stage === "r3_reject"
    ) {
      hiveReject.add(l.id);
    }
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
  bump(r1Booked, "r1Booked");
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
      row.calling.allocatedLeads > 0
        ? Number((mine.length / row.calling.allocatedLeads).toFixed(2))
        : 0;
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

  const rows = Array.from(byCounselor.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const totals = {
    calling: emptyCalling(),
    pipeline: emptyPipeline(),
  };
  for (const r of rows) {
    totals.calling.allocatedLeads += r.calling.allocatedLeads;
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
    totals.calling.allocatedLeads > 0
      ? Number(
          (totals.calling.totalCalls / totals.calling.allocatedLeads).toFixed(2)
        )
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

  return { rows, totals, funnelOfAllocated };
}

export async function fetchCounselorDashboard(
  _supabase: SupabaseClient,
  filters: CounselorDashFilters = {}
): Promise<CounselorDashboard> {
  const key = filterKey(filters);
  return unstable_cache(
    () => fetchCounselorDashboardUncached(filters),
    ["counselor-dashboard", key],
    { revalidate: 60, tags: ["counselor-dashboard"] }
  )();
}
