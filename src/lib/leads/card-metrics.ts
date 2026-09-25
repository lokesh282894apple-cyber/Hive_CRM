import type { createClient } from "@/lib/supabase/server";
import type { LeadSourceClass } from "@/lib/leads/source-class";
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
  /** Organic / inorganic from marketing attribution + source heuristics */
  sourceClass?: LeadSourceClass;
  /** Soonest open task — shown on board/list without opening the lead */
  nextOpenTask?: { id: string; title: string; due_at: string } | null;
  openTaskCount?: number;
};

export async function loadLeadCardMetrics(
  supabase: Supabase,
  leads: LeadWithRelations[]
): Promise<LeadWithCard[]> {
  const ids = leads.map((l) => l.id);
  if (!ids.length) return leads;

  // Uses the highly optimized Postgres RPC to fetch all metrics in 1 network call
  // instead of N+1 or chunked queries over HTTP.
  const { data: metricsData, error } = await supabase.rpc("get_lead_card_metrics", {
    p_lead_ids: ids,
  });

  if (error) {
    console.error("[loadLeadCardMetrics] RPC failed:", error.message);
    return leads;
  }

  const metricsMap = new Map<string, LeadCardMetrics>();
  for (const m of (metricsData ?? []) as any[]) {
    metricsMap.set(m.lead_id, {
      totalCalls: m.totalCalls ?? 0,
      uniqueDays: m.uniqueDays ?? 0,
      lastCallAt: m.lastCallAt ?? null,
      lastCallSinceStageAt: m.lastCallSinceStageAt ?? null,
      interviewAt: m.interviewAt ?? null,
      stageEnteredAt: m.stageEnteredAt ?? null,
      callsSinceStage: m.callsSinceStage ?? 0,
      avgCallsPerDaySinceStage:
        m.callsSinceStage > 0 && m.stageEnteredAt
          ? Number(
              (
                m.callsSinceStage /
                Math.max(
                  1,
                  Math.ceil(
                    (Date.now() - new Date(m.stageEnteredAt).getTime()) / 86400000
                  )
                )
              ).toFixed(2)
            )
          : null,
      gradeAvg: m.gradeAvg ? Number(m.gradeAvg) : null,
      gradeCount: m.gradeCount ?? 0,
      recordingUrl: m.recordingUrl ?? null,
      approvals: m.approvals ?? [],
    });
  }

  return leads.map((lead) => {
    const leadRecording =
      (lead as { recording_url?: string | null }).recording_url ?? null;
    const m = metricsMap.get(lead.id);

    return {
      ...lead,
      cardMetrics: m
        ? {
            ...m,
            lastCallAt: m.lastCallAt ?? lead.last_contacted_at ?? null,
            recordingUrl: leadRecording || m.recordingUrl,
          }
        : undefined,
    };
  });
}

export function hoursSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.max(0, (Date.now() - new Date(iso).getTime()) / 3_600_000);
}
