import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/supabase/paginate";

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
  /** Distinct call log rows (same as totalCalls; surfaced explicitly for UI) */
  uniqueCalls: number;
};

export type CounselorPipelineStats = {
  allocated: number;
  r1Booked: number;
  r1Conducted: number;
  r2Booked: number;
  r3Booked: number;
  offer: number;
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
};

/** Keep PostgREST `.in()` URLs under the request-size limit. */
const IN_CHUNK = 120;

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
  };
}

function emptyPipeline(): CounselorPipelineStats {
  return {
    allocated: 0,
    r1Booked: 0,
    r1Conducted: 0,
    r2Booked: 0,
    r3Booked: 0,
    offer: 0,
  };
}

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function chunkIds(ids: string[], size = IN_CHUNK): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

export async function fetchCounselorDashboard(
  supabase: SupabaseClient,
  filters: CounselorDashFilters = {}
): Promise<CounselorDashboard> {
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

  const leads = await fetchAllPages<{
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
  }, "counselor-leads");

  const leadIds = leads.map((l) => l.id);
  const leadIdChunks = chunkIds(leadIds);

  type CallRow = {
    lead_id: string;
    counselor_id: string;
    logged_at: string;
    duration: number | null;
    outcome: string | null;
  };
  type HistoryRow = {
    lead_id: string;
    to_stage: string;
    changed_at: string;
  };

  const calls: CallRow[] = [];
  const history: HistoryRow[] = [];

  for (const chunk of leadIdChunks) {
    const [callPage, histPage] = await Promise.all([
      fetchAllPages<CallRow>(
        (from, to) => {
          let q = supabase
            .from("call_logs")
            .select("lead_id, counselor_id, logged_at, duration, outcome")
            .in("lead_id", chunk)
            .gte("logged_at", since)
            .lt("logged_at", until)
            .order("logged_at", { ascending: true });
          if (filters.counselorId) q = q.eq("counselor_id", filters.counselorId);
          return q.range(from, to);
        },
        "counselor-calls"
      ),
      fetchAllPages<HistoryRow>(
        (from, to) =>
          supabase
            .from("stage_history")
            .select("lead_id, to_stage, changed_at")
            .in("lead_id", chunk)
            .gte("changed_at", since)
            .lt("changed_at", until)
            .order("changed_at", { ascending: true })
            .range(from, to),
        "counselor-history"
      ),
    ]);
    calls.push(...callPage);
    history.push(...histPage);
  }

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

  // Pipeline from stage history (more accurate for period activity)
  const r1Booked = new Set<string>();
  const r1Conducted = new Set<string>();
  const r2Booked = new Set<string>();
  const r3Booked = new Set<string>();
  const offered = new Set<string>();
  for (const h of history) {
    if (h.to_stage === "r1_booked") r1Booked.add(h.lead_id);
    if (
      h.to_stage === "r1_confirmed" ||
      h.to_stage === "r2_booked" ||
      h.to_stage === "r2_tbb"
    ) {
      r1Conducted.add(h.lead_id);
    }
    if (h.to_stage === "r2_booked") r2Booked.add(h.lead_id);
    if (h.to_stage === "r3_booked") r3Booked.add(h.lead_id);
    if (h.to_stage === "offered" || h.to_stage === "yet_to_offer") {
      offered.add(h.lead_id);
    }
  }

  const leadOwner = new Map(leads.map((l) => [l.id, l.lead_allocated_to]));
  for (const row of Array.from(byCounselor.values())) {
    row.pipeline.r1Booked = 0;
    row.pipeline.r1Conducted = 0;
    row.pipeline.r2Booked = 0;
    row.pipeline.r3Booked = 0;
    row.pipeline.offer = 0;
  }
  const bump = (set: Set<string>, field: keyof CounselorPipelineStats) => {
    for (const lid of Array.from(set)) {
      const oid = leadOwner.get(lid);
      if (!oid) continue;
      const row = byCounselor.get(oid);
      if (!row || field === "allocated") continue;
      row.pipeline[field] += 1;
    }
  };
  bump(r1Booked, "r1Booked");
  bump(r1Conducted, "r1Conducted");
  bump(r2Booked, "r2Booked");
  bump(r3Booked, "r3Booked");
  bump(offered, "offer");

  const callsByCounselor = new Map<string, typeof calls>();
  for (const c of calls) {
    const arr = callsByCounselor.get(c.counselor_id) ?? [];
    arr.push(c);
    callsByCounselor.set(c.counselor_id, arr);
  }

  for (const [cid, mine] of Array.from(callsByCounselor.entries())) {
    const row = byCounselor.get(cid);
    if (!row) continue;
    const uniqueDays = new Set(mine.map((c) => dayKey(c.logged_at)));
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
    row.calling.totalCalls = mine.length;
    row.calling.uniqueCalls = mine.length;
    row.calling.uniqueCallDays = uniqueDays.size;
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
    totals.pipeline.allocated += r.pipeline.allocated;
    totals.pipeline.r1Booked += r.pipeline.r1Booked;
    totals.pipeline.r1Conducted += r.pipeline.r1Conducted;
    totals.pipeline.r2Booked += r.pipeline.r2Booked;
    totals.pipeline.r3Booked += r.pipeline.r3Booked;
    totals.pipeline.offer += r.pipeline.offer;
  }
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

  return { rows, totals };
}
