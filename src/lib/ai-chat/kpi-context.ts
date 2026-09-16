import type { createClient } from "@/lib/supabase/server";
import { STAGE_LABELS, type Stage } from "@/lib/constants";

type Supabase = ReturnType<typeof createClient>;

/** Compact KPI snapshot for the AI system prompt — keep token use low. */
export async function fetchAiChatKpiContext(supabase: Supabase): Promise<Record<string, unknown>> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthStartIso = monthStart.toISOString();
  const monthKey = monthStart.toISOString().slice(0, 7);

  const [
    { count: totalLeads },
    { data: stageRows },
    { count: leadsThisMonth },
    { data: spendRows },
    { data: noteRows },
  ] = await Promise.all([
    supabase.from("leads").select("*", { count: "exact", head: true }),
    supabase.from("leads").select("stage"),
    supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .gte("created_at", monthStartIso),
    supabase.from("ad_insights_weekly").select("spend").gte("week_start", `${monthKey}-01`),
    supabase
      .from("marketing_daily_notes")
      .select("organic_spend_inr, inorganic_spend_inr")
      .gte("note_date", `${monthKey}-01`),
  ]);

  const byStage: Record<string, number> = {};
  for (const row of stageRows ?? []) {
    const stage = String((row as { stage: string }).stage || "unknown");
    byStage[stage] = (byStage[stage] ?? 0) + 1;
  }

  const labeledStages: Record<string, number> = {};
  for (const [stage, count] of Object.entries(byStage)) {
    const label = STAGE_LABELS[stage as Stage] ?? stage;
    labeledStages[label] = count;
  }

  const metaSpend = (spendRows ?? []).reduce(
    (sum, r) => sum + (Number((r as { spend: unknown }).spend) || 0),
    0
  );
  const organicSpend = (noteRows ?? []).reduce(
    (sum, r) => sum + (Number((r as { organic_spend_inr: unknown }).organic_spend_inr) || 0),
    0
  );
  const inorganicSpend = (noteRows ?? []).reduce(
    (sum, r) =>
      sum + (Number((r as { inorganic_spend_inr: unknown }).inorganic_spend_inr) || 0),
    0
  );

  const funnelHints = {
    closed_paid: byStage.closed_paid ?? 0,
    closed_deferred: byStage.closed_deferred ?? 0,
    closed_refund: byStage.closed_refund ?? 0,
    offered: byStage.offered ?? 0,
    yet_to_offer: byStage.yet_to_offer ?? 0,
    r1_booked: byStage.r1_booked ?? 0,
    r2_booked: byStage.r2_booked ?? 0,
    r3_booked: byStage.r3_booked ?? 0,
    new_lead: byStage.new_lead ?? 0,
  };

  return {
    as_of: new Date().toISOString(),
    month_key: monthKey,
    totals: {
      leads: totalLeads ?? 0,
      leads_created_this_month: leadsThisMonth ?? 0,
    },
    funnel_counts: funnelHints,
    stages_all: labeledStages,
    spend_this_month: {
      meta_ad_insights: metaSpend,
      organic_notes_inr: organicSpend,
      inorganic_notes_inr: inorganicSpend,
      notes_total_inr: organicSpend + inorganicSpend,
    },
  };
}
