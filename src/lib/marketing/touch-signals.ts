import type { SupabaseClient } from "@supabase/supabase-js";

/** First-touch campaign, else last-touch, plus the linked visit's UTM. */
export type TouchSignal = {
  campaignType: string | null;
  utmMedium: string | null;
  utmSource: string | null;
};

type AttrRow = {
  lead_id: string;
  first_touch_campaign_id: string | null;
  last_touch_campaign_id: string | null;
  session_id: string | null;
};

const CHUNK = 150;

async function inIds<T>(
  ids: string[],
  run: (chunk: string[]) => Promise<T[]>
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    out.push(...(await run(ids.slice(i, i + CHUNK))));
  }
  return out;
}

/**
 * How a lead was acquired, for organic / inorganic.
 * First-touch campaign when it exists, otherwise last touch.
 * UTM comes from the linked visit — the lead row often never copies it.
 */
export async function loadTouchSignals(
  admin: SupabaseClient,
  leadIds: string[]
): Promise<Map<string, TouchSignal>> {
  const out = new Map<string, TouchSignal>();
  if (!leadIds.length) return out;

  const attrs = await inIds<AttrRow>(leadIds, async (chunk) => {
    const { data, error } = await admin
      .from("lead_attribution")
      .select("lead_id, first_touch_campaign_id, last_touch_campaign_id, session_id")
      .in("lead_id", chunk);
    if (error) throw new Error(`touch attribution: ${error.message}`);
    return (data ?? []) as AttrRow[];
  });

  const campIds = Array.from(
    new Set(
      attrs.flatMap((a) => [a.first_touch_campaign_id, a.last_touch_campaign_id].filter(Boolean))
    )
  ) as string[];
  const sessionIds = Array.from(
    new Set(attrs.map((a) => a.session_id).filter(Boolean))
  ) as string[];

  const campType = new Map<string, string>();
  await inIds(campIds, async (chunk) => {
    const { data, error } = await admin.from("campaigns").select("id, source_type").in("id", chunk);
    if (error) throw new Error(`touch campaigns: ${error.message}`);
    for (const c of data ?? []) campType.set(c.id as string, c.source_type as string);
    return [];
  });

  const sess = new Map<string, { utm_medium: string | null; utm_source: string | null }>();
  await inIds(sessionIds, async (chunk) => {
    const { data, error } = await admin
      .from("visitor_sessions")
      .select("id, utm_medium, utm_source")
      .in("id", chunk);
    if (error) throw new Error(`touch sessions: ${error.message}`);
    for (const s of data ?? []) {
      sess.set(s.id as string, {
        utm_medium: (s.utm_medium as string | null) ?? null,
        utm_source: (s.utm_source as string | null) ?? null,
      });
    }
    return [];
  });

  for (const a of attrs) {
    const first = a.first_touch_campaign_id ? campType.get(a.first_touch_campaign_id) ?? null : null;
    const last = a.last_touch_campaign_id ? campType.get(a.last_touch_campaign_id) ?? null : null;
    const s = a.session_id ? sess.get(a.session_id) : undefined;
    out.set(a.lead_id, {
      campaignType: first ?? last ?? null,
      utmMedium: s?.utm_medium ?? null,
      utmSource: s?.utm_source ?? null,
    });
  }
  return out;
}
