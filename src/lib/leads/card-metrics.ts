import type { createClient } from "@/lib/supabase/server";
import { fetchAllPages } from "@/lib/supabase/paginate";
import type { LeadWithRelations } from "@/types/database";

type Supabase = ReturnType<typeof createClient>;

export type LeadApprovalSummary = {
  slot: string;
  label: string | null;
  status: boolean;
  approvedByName: string | null;
  approvedAt: string | null;
};

export type LeadCardMetrics = {
  totalCalls: number;
  uniqueDays: number;
  lastCallAt: string | null;
  /** Last call at or after current stage entry */
  lastCallSinceStageAt: string | null;
  interviewAt: string | null;
  stageEnteredAt: string | null;
  callsSinceStage: number;
  avgCallsPerDaySinceStage: number | null;
  gradeAvg: number | null;
  gradeCount: number;
  recordingUrl: string | null;
  approvals: LeadApprovalSummary[];
};

export type LeadWithCard = LeadWithRelations & {
  cardMetrics?: LeadCardMetrics;
};

const IN_CHUNK = 80;

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function chunkIds(ids: string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) out.push(ids.slice(i, i + IN_CHUNK));
  return out;
}

export async function loadLeadCardMetrics(
  supabase: Supabase,
  leads: LeadWithRelations[]
): Promise<LeadWithCard[]> {
  const ids = leads.map((l) => l.id);
  if (!ids.length) return leads;

  type CallRow = { lead_id: string; logged_at: string; recording_url: string | null };
  type BookingRow = {
    lead_id: string;
    scheduled_at: string;
    created_at: string;
    read_ai_report_url: string | null;
  };
  type HistoryRow = { lead_id: string; to_stage: string; changed_at: string };
  type GradeRow = { lead_id: string; score: number };
  type ApprovalRow = {
    lead_id: string;
    slot: string;
    label: string | null;
    status: boolean;
    approved_at: string | null;
    approver?: { name?: string } | null;
  };

  const calls: CallRow[] = [];
  const bookings: BookingRow[] = [];
  const history: HistoryRow[] = [];
  const grades: GradeRow[] = [];
  const approvals: ApprovalRow[] = [];

  for (const chunk of chunkIds(ids)) {
    const [callPage, bookingPage, historyPage, gradePage, approvalPage] =
      await Promise.all([
        fetchAllPages<CallRow>(
          (from, to) =>
            supabase
              .from("call_logs")
              .select("lead_id, logged_at, recording_url")
              .in("lead_id", chunk)
              .order("logged_at", { ascending: false })
              .range(from, to),
          "card-metrics.calls"
        ),
        supabase
          .from("interview_bookings")
          .select("lead_id, scheduled_at, created_at, read_ai_report_url")
          .in("lead_id", chunk)
          .order("scheduled_at", { ascending: false }),
        fetchAllPages<HistoryRow>(
          (from, to) =>
            supabase
              .from("stage_history")
              .select("lead_id, to_stage, changed_at")
              .in("lead_id", chunk)
              .order("changed_at", { ascending: false })
              .range(from, to),
          "card-metrics.history"
        ),
        supabase.from("lead_panelist_grades").select("lead_id, score").in("lead_id", chunk),
        supabase
          .from("lead_approvals")
          .select(
            "lead_id, slot, label, status, approved_at, approved_by, approver:users!lead_approvals_approved_by_fkey(name)"
          )
          .in("lead_id", chunk),
      ]);

    calls.push(...callPage);
    bookings.push(...((bookingPage.data ?? []) as BookingRow[]));
    history.push(...historyPage);
    grades.push(...((gradePage.data ?? []) as GradeRow[]));
    approvals.push(...((approvalPage.data ?? []) as ApprovalRow[]));
  }

  const callsByLead = new Map<string, CallRow[]>();
  for (const c of calls) {
    const list = callsByLead.get(c.lead_id) ?? [];
    list.push(c);
    callsByLead.set(c.lead_id, list);
  }
  const interviewByLead = new Map<string, string>();
  const readAiByLead = new Map<string, string>();
  for (const b of bookings) {
    if (!interviewByLead.has(b.lead_id)) {
      interviewByLead.set(b.lead_id, b.scheduled_at || b.created_at);
    }
    if (b.read_ai_report_url && !readAiByLead.has(b.lead_id)) {
      readAiByLead.set(b.lead_id, b.read_ai_report_url);
    }
  }
  const stageEntered = new Map<string, string>();
  for (const h of history) {
    const key = `${h.lead_id}:${h.to_stage}`;
    if (!stageEntered.has(key)) stageEntered.set(key, h.changed_at);
  }
  const gradeAgg = new Map<string, { sum: number; n: number }>();
  for (const g of grades) {
    const cur = gradeAgg.get(g.lead_id) ?? { sum: 0, n: 0 };
    cur.sum += Number(g.score);
    cur.n += 1;
    gradeAgg.set(g.lead_id, cur);
  }
  const approvalsByLead = new Map<string, LeadApprovalSummary[]>();
  for (const a of approvals) {
    const list = approvalsByLead.get(a.lead_id) ?? [];
    list.push({
      slot: a.slot,
      label: a.label,
      status: a.status,
      approvedByName: a.approver?.name ?? null,
      approvedAt: a.approved_at,
    });
    approvalsByLead.set(a.lead_id, list);
  }

  return leads.map((lead) => {
    const leadCalls = callsByLead.get(lead.id) ?? [];
    const unique = new Set(leadCalls.map((c) => dayKey(c.logged_at)));
    const lastCallAt = leadCalls.reduce<string | null>((acc, c) => {
      if (!acc || c.logged_at > acc) return c.logged_at;
      return acc;
    }, null);
    const callRecording = leadCalls.find((c) => c.recording_url)?.recording_url;
    const leadRecording =
      (lead as { recording_url?: string | null }).recording_url ?? null;
    const entered =
      stageEntered.get(`${lead.id}:${lead.stage}`) ?? lead.created_at;
    const sinceCalls = leadCalls.filter((c) => c.logged_at >= entered);
    const lastCallSinceStageAt = sinceCalls.reduce<string | null>((acc, c) => {
      if (!acc || c.logged_at > acc) return c.logged_at;
      return acc;
    }, null);
    const daysSince = Math.max(
      1,
      Math.ceil((Date.now() - new Date(entered).getTime()) / 86_400_000)
    );
    const g = gradeAgg.get(lead.id);
    return {
      ...lead,
      cardMetrics: {
        totalCalls: leadCalls.length,
        uniqueDays: unique.size,
        lastCallAt,
        lastCallSinceStageAt,
        interviewAt: interviewByLead.get(lead.id) ?? null,
        stageEnteredAt: entered,
        callsSinceStage: sinceCalls.length,
        avgCallsPerDaySinceStage: Number(
          (sinceCalls.length / daysSince).toFixed(2)
        ),
        gradeAvg: g ? Number((g.sum / g.n).toFixed(2)) : null,
        gradeCount: g?.n ?? 0,
        recordingUrl:
          leadRecording ||
          readAiByLead.get(lead.id) ||
          callRecording ||
          null,
        approvals: approvalsByLead.get(lead.id) ?? [],
      },
    };
  });
}

export function hoursSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.max(0, (Date.now() - new Date(iso).getTime()) / 3_600_000);
}
