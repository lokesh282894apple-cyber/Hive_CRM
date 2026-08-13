import type { SupabaseClient } from "@supabase/supabase-js";
import { admissionsAggClient } from "@/lib/analytics/agg-client";
import { getAdmissionsBase } from "@/lib/analytics/admissions-base";
import {
  OPEN_STAGES,
  STAGE_GROUPS,
  STAGE_LABELS,
  type Stage,
} from "@/lib/constants";
import { labelForLeadSource } from "@/lib/leads/form-origin";
import {
  eachDateKey,
  resolveAnalyticsRange,
} from "@/lib/analytics/date-range";

export type NamedCount = { name: string; count: number; id?: string };
export type DailyCount = { date: string; leads: number; won: number; calls: number };

export type AdmissionsAnalytics = {
  rangeDays: number;
  fromDate: string;
  toDate: string;
  kpis: {
    totalLeads: number;
    openLeads: number;
    newLeads: number;
    attentionLeads: number;
    won: number;
    lost: number;
    winRate: number;
    unassigned: number;
    attributed: number;
    interviewsToday: number;
    interviewsUpcoming: number;
    callsInRange: number;
    feeCollected: number;
    feeOutstanding: number;
    sessionsInRange: number;
    formConversionsInRange: number;
  };
  funnelGroups: NamedCount[];
  stageBreakdown: NamedCount[];
  sourceMix: NamedCount[];
  courseMix: NamedCount[];
  counselorBoard: {
    id: string;
    name: string;
    total: number;
    open: number;
    won: number;
    lost: number;
    attention: number;
    winRate: number;
    calls: number;
  }[];
  daily: DailyCount[];
  recentLeads: {
    id: string;
    name: string;
    stage: string;
    source: string | null;
    created_at: string;
    counselor: string | null;
  }[];
  attentionList: { id: string; name: string; stage: string }[];
  interviewsToday: {
    id: string;
    scheduled_at: string;
    round: string;
    meet_link: string | null;
    leadName: string;
  }[];
  paymentModeMix: NamedCount[];
  vendorLoanStats: { name: string; sent: number; approved: number; rate: number }[];
  /** Shared raw rows so founder-command need not re-query */
  leadRows: {
    id: string;
    stage: string;
    source: string | null;
    course_id: string | null;
    cohort_id: string | null;
    lead_allocated_to: string | null;
    created_at: string;
    updated_at: string;
    last_contacted_at: string | null;
  }[];
  callRows: { lead_id: string; logged_at: string; counselor_id: string }[];
};

const ATTENTION_STAGES = [
  "dnp",
  "no_show",
  "reschedule",
  "r1_no_show",
  "r2_no_show",
  "r3_no_show",
] as const;

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function emptyDailyBetween(fromDate: string, toDate: string): DailyCount[] {
  return eachDateKey(fromDate, toDate).map((date) => ({
    date,
    leads: 0,
    won: 0,
    calls: 0,
  }));
}

export async function fetchAdmissionsAnalytics(
  supabase: SupabaseClient,
  opts?: {
    counselorId?: string | null;
    courseId?: string | null;
    cohortId?: string | null;
    rangeDays?: number;
    fromDate?: string | null;
    toDate?: string | null;
  }
): Promise<AdmissionsAnalytics> {
  const range = resolveAnalyticsRange({
    from: opts?.fromDate,
    to: opts?.toDate,
    rangeDays: opts?.rangeDays,
  });
  const { fromDate, toDate, rangeDays, sinceIso, untilExclusiveIso } = range;
  const counselorId = opts?.counselorId ?? null;
  const courseId = opts?.courseId ?? null;
  const cohortId = opts?.cohortId ?? null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekAhead = new Date(today);
  weekAhead.setDate(weekAhead.getDate() + 7);

  const db = admissionsAggClient();
  const base = await getAdmissionsBase(counselorId, courseId, cohortId);
  const all = base.leads;
  const leadIds = all.map((l) => l.id);
  const filtered = base.filtered;
  const courses = base.courses;
  const counselors = base.counselors;

  let callsQ = db
    .from("call_logs")
    .select("id, lead_id, logged_at, counselor_id")
    .gte("logged_at", sinceIso)
    .lt("logged_at", untilExclusiveIso);
  if (counselorId) callsQ = callsQ.eq("counselor_id", counselorId);

  const [
    { data: calls },
    { count: interviewsUpcoming },
    { count: sessionsInRange },
    { count: formConversionsInRange },
    { count: attributedCount },
    feesBundle,
  ] = await Promise.all([
    callsQ.limit(2500),
    (async () => {
      const inWeek = base.bookings.filter((b) => {
        const at = b.scheduled_at;
        return at >= today.toISOString() && at < weekAhead.toISOString();
      });
      return { count: inWeek.length };
    })(),
    db
      .from("visitor_sessions")
      .select("id", { count: "exact", head: true })
      .gte("first_seen_at", sinceIso)
      .lt("first_seen_at", untilExclusiveIso),
    db
      .from("lead_attribution")
      .select("id", { count: "exact", head: true })
      .gte("converted_at", sinceIso)
      .lt("converted_at", untilExclusiveIso),
    db.from("lead_attribution").select("id", { count: "exact", head: true }),
    (async () => {
      if (filtered && leadIds.length === 0) {
        return {
          feeRecords: [] as {
            lead_id?: string;
            total_fee: number;
            remaining_fee: number;
            payment_mode: string | null;
          }[],
          loans: [] as {
            stage: string;
            loan_vendor_id: string | null;
            amount_realised?: number;
            total_fee?: number;
          }[],
          vendors: [] as { id: string; name: string }[],
        };
      }
      if (filtered) {
        const { data: fees } = await db
          .from("fee_records")
          .select("id, lead_id, total_fee, remaining_fee, payment_mode")
          .in("lead_id", leadIds);
        const feeRecords = fees ?? [];
        const feeIds = feeRecords.map((f) => f.id).filter(Boolean);
        let loans: {
          stage: string;
          loan_vendor_id: string | null;
          amount_realised?: number;
          total_fee?: number;
        }[] = [];
        if (feeIds.length) {
          const { data: loanRows } = await db
            .from("loans")
            .select("stage, loan_vendor_id, amount_realised, total_fee, fee_record_id")
            .in("fee_record_id", feeIds);
          loans = loanRows ?? [];
        }
        const { data: vendorRows } = await db.from("loan_vendors").select("id, name");
        return { feeRecords, loans, vendors: vendorRows ?? [] };
      }
      const [feesRes, loansRes, vendorsRes] = await Promise.all([
        db.from("fee_records").select("total_fee, remaining_fee, payment_mode"),
        db.from("loans").select("stage, loan_vendor_id, amount_realised, total_fee"),
        db.from("loan_vendors").select("id, name"),
      ]);
      return {
        feeRecords: feesRes.data ?? [],
        loans: loansRes.data ?? [],
        vendors: vendorsRes.data ?? [],
      };
    })(),
  ]);

  const feeRecords = feesBundle.feeRecords;
  const loans = feesBundle.loans;
  const vendors = feesBundle.vendors;

  const interviewsTodayRows = base.bookings
    .filter((b) => {
      const at = b.scheduled_at;
      return at >= today.toISOString() && at < tomorrow.toISOString();
    })
    .slice(0, 50)
    .map((b) => {
      const lead = base.leads.find((l) => l.id === b.lead_id);
      return {
        id: b.id,
        scheduled_at: b.scheduled_at,
        round: b.round,
        meet_link: b.meet_link,
        lead_id: b.lead_id,
        leads: lead
          ? {
              id: lead.id,
              name: lead.name,
              lead_allocated_to: lead.lead_allocated_to,
              course_id: lead.course_id,
              cohort_id: lead.cohort_id,
            }
          : null,
      };
    });

  const courseMap = new Map(courses.map((c) => [c.id, c.name]));
  const counselorMap = new Map(counselors.map((c) => [c.id, c.name]));
  // attributedCount is total attributed leads in CRM (unique lead_id)

  const openLeads = all.filter((l) => OPEN_STAGES.includes(l.stage as Stage)).length;
  const newLeads = all.filter((l) =>
    ["new_lead", "lead_created", "call_logged_nurturing"].includes(l.stage)
  ).length;
  const attentionLeads = all.filter((l) =>
    (ATTENTION_STAGES as readonly string[]).includes(l.stage)
  ).length;
  const won = all.filter((l) => l.stage === "closed_won").length;
  const lost = all.filter((l) => l.stage === "closed_lost").length;
  const closed = won + lost;
  const unassigned = all.filter((l) => !l.lead_allocated_to).length;
  const attributed = attributedCount ?? 0;

  const funnelGroups = [
    ...STAGE_GROUPS.filter((g) => !["open", "all"].includes(g.id)),
    { id: "won", label: "Closed Won", stages: ["closed_won"] as Stage[] },
    { id: "lost", label: "Closed Lost", stages: ["closed_lost"] as Stage[] },
  ].map((g) => ({
    name: g.label,
    count: all.filter((l) => (g.stages as readonly string[]).includes(l.stage)).length,
  }));

  const stageCounts = new Map<string, number>();
  for (const l of all) {
    stageCounts.set(l.stage, (stageCounts.get(l.stage) ?? 0) + 1);
  }
  const stageBreakdown = Array.from(stageCounts.entries())
    .map(([stage, count]) => ({
      name: STAGE_LABELS[stage as Stage] ?? stage,
      count,
      id: stage,
    }))
    .sort((a, b) => b.count - a.count);

  const sourceCounts = new Map<string, number>();
  for (const l of all) {
    const label = labelForLeadSource(l.source);
    sourceCounts.set(label, (sourceCounts.get(label) ?? 0) + 1);
  }
  const sourceMix = Array.from(sourceCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const courseCounts = new Map<string, number>();
  for (const l of all) {
    const name = l.course_id ? courseMap.get(l.course_id) ?? "Unknown course" : "Unassigned course";
    courseCounts.set(name, (courseCounts.get(name) ?? 0) + 1);
  }
  const courseMix = Array.from(courseCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const boardCounselors = counselorId
    ? counselors.filter((c) => c.id === counselorId)
    : counselors;

  const callsByCounselor = new Map<string, number>();
  for (const c of calls ?? []) {
    if (!c.counselor_id) continue;
    callsByCounselor.set(
      c.counselor_id,
      (callsByCounselor.get(c.counselor_id) ?? 0) + 1
    );
  }

  const counselorBoard = boardCounselors
    .map((c) => {
      const mine = all.filter((l) => l.lead_allocated_to === c.id);
      const cWon = mine.filter((l) => l.stage === "closed_won").length;
      const cLost = mine.filter((l) => l.stage === "closed_lost").length;
      const cClosed = cWon + cLost;
      return {
        id: c.id,
        name: c.name,
        total: mine.length,
        open: mine.filter((l) => OPEN_STAGES.includes(l.stage as Stage)).length,
        won: cWon,
        lost: cLost,
        attention: mine.filter((l) =>
          (ATTENTION_STAGES as readonly string[]).includes(l.stage)
        ).length,
        winRate: cClosed ? (cWon / cClosed) * 100 : 0,
        calls: callsByCounselor.get(c.id) ?? 0,
      };
    })
    .sort((a, b) => b.total - a.total);

  const daily = emptyDailyBetween(fromDate, toDate);
  const dailyMap = new Map(daily.map((d) => [d.date, d]));
  for (const l of all) {
    if (l.created_at < sinceIso || l.created_at >= untilExclusiveIso) continue;
    const row = dailyMap.get(dayKey(l.created_at));
    if (row) row.leads += 1;
  }
  for (const l of all) {
    if (l.stage !== "closed_won") continue;
    // approximate won timing with updated_at in range
    if (
      l.updated_at &&
      l.updated_at >= sinceIso &&
      l.updated_at < untilExclusiveIso
    ) {
      const row = dailyMap.get(dayKey(l.updated_at));
      if (row) row.won += 1;
    }
  }
  for (const c of calls ?? []) {
    const row = dailyMap.get(dayKey(c.logged_at));
    if (row) row.calls += 1;
  }

  const feeCollected = (feeRecords ?? []).reduce(
    (s, f) => s + (Number(f.total_fee) - Number(f.remaining_fee)),
    0
  );
  const feeOutstanding = (feeRecords ?? []).reduce(
    (s, f) => s + Number(f.remaining_fee),
    0
  );

  const paymentModeCounts = new Map<string, number>();
  for (const f of feeRecords ?? []) {
    const mode = f.payment_mode || "unknown";
    paymentModeCounts.set(mode, (paymentModeCounts.get(mode) ?? 0) + 1);
  }
  const paymentModeMix = Array.from(paymentModeCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const sentOrLater = (loans ?? []).filter((l) =>
    ["sent_to_vendor", "approved", "disbursed_pending", "disbursed_hit_bank"].includes(l.stage)
  );
  const approvedOrLater = (loans ?? []).filter((l) =>
    ["approved", "disbursed_pending", "disbursed_hit_bank"].includes(l.stage)
  );
  const vendorLoanStats = (vendors ?? []).map((v) => {
    const sent = sentOrLater.filter((l) => l.loan_vendor_id === v.id).length;
    const approved = approvedOrLater.filter((l) => l.loan_vendor_id === v.id).length;
    return {
      name: v.name,
      sent,
      approved,
      rate: sent ? Math.round((approved / sent) * 100) : 0,
    };
  });

  const recentLeads = [...all]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 12)
    .map((l) => ({
      id: l.id,
      name: l.name,
      stage: l.stage,
      source: l.source,
      created_at: l.created_at,
      counselor: l.lead_allocated_to
        ? counselorMap.get(l.lead_allocated_to) ?? null
        : null,
    }));

  const attentionList = all
    .filter((l) => (ATTENTION_STAGES as readonly string[]).includes(l.stage))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 10)
    .map((l) => ({ id: l.id, name: l.name, stage: l.stage }));

  const interviewsToday = (interviewsTodayRows ?? []).map((iv) => {
    const lead = iv.leads as unknown as { name: string } | null;
    return {
      id: iv.id,
      scheduled_at: iv.scheduled_at,
      round: iv.round,
      meet_link: iv.meet_link,
      leadName: lead?.name ?? "Lead",
    };
  });

  return {
    rangeDays,
    fromDate,
    toDate,
    kpis: {
      totalLeads: all.length,
      openLeads,
      newLeads,
      attentionLeads,
      won,
      lost,
      winRate: closed ? (won / closed) * 100 : 0,
      unassigned,
      attributed,
      interviewsToday: interviewsToday.length,
      interviewsUpcoming: interviewsUpcoming ?? 0,
      callsInRange: (calls ?? []).length,
      feeCollected,
      feeOutstanding,
      sessionsInRange: sessionsInRange ?? 0,
      formConversionsInRange: formConversionsInRange ?? 0,
    },
    funnelGroups,
    stageBreakdown,
    sourceMix,
    courseMix,
    counselorBoard,
    daily,
    recentLeads,
    attentionList,
    interviewsToday,
    paymentModeMix,
    vendorLoanStats,
    leadRows: all.map((l) => ({
      id: l.id,
      stage: l.stage,
      source: l.source,
      course_id: l.course_id,
      cohort_id: l.cohort_id,
      lead_allocated_to: l.lead_allocated_to,
      created_at: l.created_at,
      updated_at: l.updated_at,
      last_contacted_at: (l as { last_contacted_at?: string | null }).last_contacted_at ?? null,
    })),
    callRows: (calls ?? []).map((c) => ({
      lead_id: c.lead_id,
      logged_at: c.logged_at,
      counselor_id: c.counselor_id,
    })),
  };
}
