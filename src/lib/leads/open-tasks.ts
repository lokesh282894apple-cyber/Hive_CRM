import type { createClient } from "@/lib/supabase/server";

type Supabase = ReturnType<typeof createClient>;

export type LeadOpenTaskSummary = {
  id: string;
  title: string;
  due_at: string;
};

const IN_CHUNK = 100;

/**
 * Next open task per lead (soonest due) + open count.
 * Used on board/list cards so counselors don't need to open the lead.
 */
export async function loadOpenTasksForLeads(
  supabase: Supabase,
  leadIds: string[]
): Promise<
  Map<string, { next: LeadOpenTaskSummary | null; openCount: number }>
> {
  const map = new Map<
    string,
    { next: LeadOpenTaskSummary | null; openCount: number }
  >();
  if (!leadIds.length) return map;

  for (let i = 0; i < leadIds.length; i += IN_CHUNK) {
    const chunk = leadIds.slice(i, i + IN_CHUNK);
    const { data, error } = await supabase
      .from("lead_tasks")
      .select("id, lead_id, title, due_at")
      .in("lead_id", chunk)
      .eq("status", "open")
      .order("due_at", { ascending: true })
      .limit(Math.min(chunk.length * 5, 800));

    if (error || !data) continue;

    for (const row of data) {
      const leadId = row.lead_id as string;
      const cur = map.get(leadId) ?? { next: null, openCount: 0 };
      cur.openCount += 1;
      if (!cur.next) {
        cur.next = {
          id: row.id as string,
          title: row.title as string,
          due_at: row.due_at as string,
        };
      }
      map.set(leadId, cur);
    }
  }

  return map;
}
