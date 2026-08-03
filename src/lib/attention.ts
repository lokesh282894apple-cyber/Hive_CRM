import { differenceInDays } from "date-fns";

/**
 * Provisional Needs Immediate Attention rules.
 * Exact client criteria are TBD — keep thresholds in app_settings.
 */
export type AttentionLead = {
  id: string;
  name: string;
  stage: string;
  last_contacted_at: string | null;
  created_at: string;
};

export type AttentionConfig = {
  noContactDays: number;
  unresolvedNoshowDays: number;
  overdueLeadIds: Set<string>;
};

export function evaluateAttentionReasons(
  lead: AttentionLead,
  config: AttentionConfig
): string[] {
  const last = lead.last_contacted_at
    ? differenceInDays(new Date(), new Date(lead.last_contacted_at))
    : differenceInDays(new Date(), new Date(lead.created_at));

  const reasons: string[] = [];

  // Provisional: overdue installment deadline
  if (config.overdueLeadIds.has(lead.id)) {
    reasons.push("Overdue installment deadline (provisional)");
  }

  // Provisional: no contact logged in N days
  if (last >= config.noContactDays) {
    reasons.push(`No contact in ${config.noContactDays}+ days (provisional)`);
  }

  // Provisional: unresolved No Show after X days
  if (/no_show/.test(lead.stage) && last >= config.unresolvedNoshowDays) {
    reasons.push(
      `Unresolved No Show after ${config.unresolvedNoshowDays}+ days (provisional)`
    );
  }

  return reasons;
}
