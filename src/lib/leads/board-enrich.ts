import type { createClient } from "@/lib/supabase/server";
import { fetchAttributionForLeads } from "@/lib/marketing/queries";
import { loadLeadCardMetrics } from "@/lib/leads/card-metrics";
import { loadOpenTasksForLeads } from "@/lib/leads/open-tasks";
import type { LeadWithRelations } from "@/types/database";

type Supabase = ReturnType<typeof createClient>;

/** Card metrics + attribution + open tasks for a set of board / list cards. */
export async function enrichLeadCards(supabase: Supabase, raw: LeadWithRelations[]) {
  const ids = raw.map((l) => l.id);
  if (!ids.length) {
    return {
      cards: [] as Awaited<ReturnType<typeof loadLeadCardMetrics>>,
      attrMap: new Map() as Awaited<ReturnType<typeof fetchAttributionForLeads>>,
      openTasks: new Map() as Awaited<ReturnType<typeof loadOpenTasksForLeads>>,
    };
  }
  const [cards, attrMap, openTasks] = await Promise.all([
    loadLeadCardMetrics(supabase, raw),
    fetchAttributionForLeads(supabase, ids),
    loadOpenTasksForLeads(supabase, ids),
  ]);
  return { cards, attrMap, openTasks };
}

/**
 * Enrich the first batch of cards straight away, while the board works out
 * which older columns need topping up; then enrich only the extra cards.
 * Filter changes used to wait for the top-up before any card details loaded.
 */
export async function enrichWithTopUp(
  supabase: Supabase,
  first: LeadWithRelations[],
  topUp: () => Promise<LeadWithRelations[]>
) {
  const firstP = enrichLeadCards(supabase, first);
  const merged = await topUp();
  const extra = merged.slice(first.length);
  const [a, b] = await Promise.all([firstP, enrichLeadCards(supabase, extra)]);
  return {
    cards: [...a.cards, ...b.cards],
    attrMap: new Map([...Array.from(a.attrMap.entries()), ...Array.from(b.attrMap.entries())]),
    openTasks: new Map([...Array.from(a.openTasks.entries()), ...Array.from(b.openTasks.entries())]),
  };
}
