import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export type RangeKey = "7" | "30" | "90";

/**
 * Aggregates must bypass per-row RLS. `is_admin_or_marketing()` on every
 * visitor_sessions / page_events row times out; service role scans indexes only.
 * Call only after requireUser(["admin","marketing"]).
 */
function marketingAggClient(_userClient: SupabaseClient): SupabaseClient {
  return createAdminClient();
}

export function parseRange(raw: string | undefined | null): RangeKey {
  if (raw === "7" || raw === "90") return raw;
  return "30";
}

export function rangeStartIso(range: RangeKey): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - Number(range));
  return d.toISOString();
}

export type DailyPoint = { date: string; sessions: number; conversions: number };

export type NamedCount = {
  id: string;
  name: string;
  sessions: number;
  attributed: number;
  pageviews?: number;
  clicks?: number;
};

export type UtmRow = {
  key: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  sessions: number;
  attributed: number;
};

export type PageRow = {
  page_url: string;
  pageviews: number;
  clicks: number;
  scroll_25: number;
  scroll_50: number;
  scroll_75: number;
  scroll_100: number;
};

export type DeviceSplit = { device: string; count: number };

export type RecentSessionRow = {
  id: string;
  first_seen_at: string;
  last_seen_at: string;
  entry_page_url: string | null;
  device_type: string | null;
  utm_source: string | null;
  campaign_name: string | null;
  lead_id: string | null;
};

export type AttributionSource = {
  lead_id: string;
  campaign_name: string | null;
  channel_name: string | null;
};

/** Calendar day in India (CRM default) — avoids UTC shifting visits onto the wrong day. */
const MARKETING_TZ = "Asia/Kolkata";

/** PostgREST/Supabase silently caps a single response at ~1000 rows (project max_rows). */
const PAGE_SIZE = 1000;
const MAX_PAGES = 100;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

function isTimeoutError(message: string) {
  return /timeout|canceling statement/i.test(message);
}

async function withTimeoutRetry<T>(
  run: () => PromiseLike<PageResult<T>>,
  attempts = 3
): Promise<PageResult<T>> {
  let last: PageResult<T> = { data: null, error: { message: "unknown" } };
  for (let i = 0; i < attempts; i++) {
    last = await run();
    if (!last.error) return last;
    if (!isTimeoutError(last.error.message) || i === attempts - 1) return last;
    await new Promise((r) => setTimeout(r, 350 * (i + 1)));
  }
  return last;
}

/**
 * Page through a query with .range() so KPI / rollups are not stuck at the
 * API max_rows ceiling. Sequential + retry — parallel deep OFFSET was timing out
 * on large page_events tables.
 */
async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<T[]> {
  const all: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const from = i * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await withTimeoutRetry(() => page(from, to));
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}

/**
 * Keyset pagination for time-ordered tables — avoids slow deep OFFSET that
 * triggers statement timeouts on big marketing event tables.
 */
async function fetchAllByTimeCursor<T extends { id: string }>(
  fetchPage: (cursor: { at: string; id: string } | null) => PromiseLike<PageResult<T>>,
  getAt: (row: T) => string
): Promise<T[]> {
  const all: T[] = [];
  let cursor: { at: string; id: string } | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await withTimeoutRetry(() => fetchPage(cursor));
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    const last = rows[rows.length - 1]!;
    cursor = { at: getAt(last), id: last.id };
  }
  return all;
}

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: MARKETING_TZ });
}

function emptyDays(range: RangeKey): Map<string, DailyPoint> {
  const map = new Map<string, DailyPoint>();
  const n = Number(range);
  const todayKey = dayKey(new Date().toISOString());
  const [y, m, d] = todayKey.split("-").map(Number);
  for (let i = n; i >= 0; i--) {
    // Calendar arithmetic on the IST Y-M-D (Date.UTC day overflow is fine)
    const key = new Date(Date.UTC(y, m - 1, d - i)).toISOString().slice(0, 10);
    map.set(key, { date: key, sessions: 0, conversions: 0 });
  }
  return map;
}

export async function fetchMarketingOverview(
  supabase: SupabaseClient,
  range: RangeKey
) {
  const since = rangeStartIso(range);
  const rangeDays = Number(range);
  const db = marketingAggClient(supabase);

  // Fast path: DB aggregates via service role (same metrics, no row shipping / no RLS tax)
  const [{ data: rpcData, error: rpcError }, { data: campaigns }, { data: channels }] =
    await Promise.all([
      db.rpc("marketing_overview", {
        p_since: since,
        p_range_days: rangeDays,
      }),
      db.from("campaigns").select("id, name, channel_id, source_type, status"),
      db.from("channels").select("id, name"),
    ]);

  if (!rpcError && rpcData && typeof rpcData === "object") {
    const payload = rpcData as {
      kpis: {
        sessions: number;
        events: number;
        attributed: number;
        conversionRate: number;
        avgEventsPerSession: number;
      };
      daily: DailyPoint[];
      byChannel: NamedCount[];
      byCampaign: NamedCount[];
      byUtm: UtmRow[];
      devices: DeviceSplit[];
      recentSessions: RecentSessionRow[];
      recentConversions: {
        id: string;
        lead_id: string;
        session_id: string;
        converted_at: string;
        first_touch_campaign_id: string | null;
        last_touch_campaign_id: string | null;
      }[];
    };

    const campaignMap = new Map((campaigns ?? []).map((c) => [c.id, c]));
    const channelMap = new Map((channels ?? []).map((c) => [c.id, c.name]));

    // Fill any missing calendar days (RPC already returns full series, but be safe)
    const dailyMap = emptyDays(range);
    for (const d of payload.daily ?? []) {
      if (dailyMap.has(d.date)) dailyMap.set(d.date, d);
    }

    return {
      kpis: {
        sessions: Number(payload.kpis?.sessions ?? 0),
        events: Number(payload.kpis?.events ?? 0),
        attributed: Number(payload.kpis?.attributed ?? 0),
        conversionRate: Number(payload.kpis?.conversionRate ?? 0),
        avgEventsPerSession: Number(payload.kpis?.avgEventsPerSession ?? 0),
      },
      daily: Array.from(dailyMap.values()),
      byChannel: (payload.byChannel ?? []).map((r) => ({
        id: String(r.id),
        name: r.name,
        sessions: Number(r.sessions),
        attributed: Number(r.attributed),
      })),
      byCampaign: (payload.byCampaign ?? []).map((r) => ({
        id: String(r.id),
        name: r.name,
        sessions: Number(r.sessions),
        attributed: Number(r.attributed),
      })),
      byUtm: (payload.byUtm ?? []).slice(0, 40).map((r) => ({
        key: r.key,
        utm_source: r.utm_source,
        utm_medium: r.utm_medium,
        utm_campaign: r.utm_campaign,
        sessions: Number(r.sessions),
        attributed: Number(r.attributed),
      })),
      devices: (payload.devices ?? []).map((d) => ({
        device: d.device,
        count: Number(d.count),
      })),
      recentSessions: (payload.recentSessions ?? []).map((s) => ({
        id: s.id,
        first_seen_at: s.first_seen_at,
        last_seen_at: s.last_seen_at,
        entry_page_url: s.entry_page_url,
        device_type: s.device_type,
        utm_source: s.utm_source,
        campaign_name: s.campaign_name ?? null,
        lead_id: s.lead_id ?? null,
      })),
      recentConversions: payload.recentConversions ?? [],
      campaignMap,
      channelMap,
      sessionIdsSample: (payload.recentSessions ?? []).map((s) => s.id).slice(0, 500),
    };
  }

  // Fallback if migration not applied yet (still service role — avoids RLS timeouts)
  const [sessionList, { count: eventCount }, attrList] =
    await Promise.all([
      fetchAllPages((from, to) =>
        db
          .from("visitor_sessions")
          .select(
            "id, first_seen_at, last_seen_at, entry_page_url, device_type, utm_source, utm_medium, utm_campaign, matched_campaign_id"
          )
          .gte("first_seen_at", since)
          .order("first_seen_at", { ascending: false })
          .range(from, to)
      ),
      db
        .from("page_events")
        .select("*", { count: "exact", head: true })
        .gte("occurred_at", since),
      fetchAllPages((from, to) =>
        db
          .from("lead_attribution")
          .select(
            "id, lead_id, session_id, converted_at, first_touch_campaign_id, last_touch_campaign_id"
          )
          .gte("converted_at", since)
          .order("converted_at", { ascending: false })
          .range(from, to)
      ),
    ]);
  const campaignMap = new Map((campaigns ?? []).map((c) => [c.id, c]));
  const channelMap = new Map((channels ?? []).map((c) => [c.id, c.name]));

  const attributedSessionIds = new Set(attrList.map((a) => a.session_id as string));

  const daily = emptyDays(range);
  for (const s of sessionList) {
    const k = dayKey(s.first_seen_at);
    const row = daily.get(k);
    if (row) row.sessions += 1;
  }
  for (const a of attrList) {
    const k = dayKey(a.converted_at);
    const row = daily.get(k);
    if (row) row.conversions += 1;
  }

  const byChannel = new Map<string, NamedCount>();
  const byCampaign = new Map<string, NamedCount>();
  const byUtm = new Map<string, UtmRow>();
  const deviceMap = new Map<string, number>();

  for (const s of sessionList) {
    const device = s.device_type || "unknown";
    deviceMap.set(device, (deviceMap.get(device) ?? 0) + 1);

    const camp = s.matched_campaign_id ? campaignMap.get(s.matched_campaign_id) : null;
    const channelName = camp ? channelMap.get(camp.channel_id) ?? "Unattributed" : "Unattributed";
    const channelId = camp?.channel_id ?? "none";
    const ch = byChannel.get(channelId) ?? {
      id: channelId,
      name: channelName,
      sessions: 0,
      attributed: 0,
    };
    ch.sessions += 1;
    if (attributedSessionIds.has(s.id)) ch.attributed += 1;
    byChannel.set(channelId, ch);

    if (camp) {
      const cg = byCampaign.get(camp.id) ?? {
        id: camp.id,
        name: camp.name,
        sessions: 0,
        attributed: 0,
      };
      cg.sessions += 1;
      if (attributedSessionIds.has(s.id)) cg.attributed += 1;
      byCampaign.set(camp.id, cg);
    }

    const uk = `${s.utm_source ?? ""}|${s.utm_medium ?? ""}|${s.utm_campaign ?? ""}`;
    if (s.utm_source || s.utm_medium || s.utm_campaign) {
      const u = byUtm.get(uk) ?? {
        key: uk,
        utm_source: s.utm_source,
        utm_medium: s.utm_medium,
        utm_campaign: s.utm_campaign,
        sessions: 0,
        attributed: 0,
      };
      u.sessions += 1;
      if (attributedSessionIds.has(s.id)) u.attributed += 1;
      byUtm.set(uk, u);
    }
  }

  const attrByCampaign = new Map<string, number>();
  for (const a of attrList) {
    const cid = a.first_touch_campaign_id;
    if (!cid) continue;
    attrByCampaign.set(cid, (attrByCampaign.get(cid) ?? 0) + 1);
  }
  for (const [cid, n] of Array.from(attrByCampaign.entries())) {
    const camp = campaignMap.get(cid);
    if (!camp) continue;
    const cg = byCampaign.get(cid) ?? {
      id: cid,
      name: camp.name,
      sessions: 0,
      attributed: 0,
    };
    cg.attributed = Math.max(cg.attributed, n);
    byCampaign.set(cid, cg);
  }

  const channelAttr = new Map<string, number>();
  for (const a of attrList) {
    const camp = a.first_touch_campaign_id
      ? campaignMap.get(a.first_touch_campaign_id)
      : null;
    const channelId = camp?.channel_id ?? "none";
    channelAttr.set(channelId, (channelAttr.get(channelId) ?? 0) + 1);
  }
  for (const [channelId, n] of Array.from(channelAttr.entries())) {
    const ch = byChannel.get(channelId) ?? {
      id: channelId,
      name: channelMap.get(channelId) ?? "Unattributed",
      sessions: 0,
      attributed: 0,
    };
    ch.attributed = n;
    byChannel.set(channelId, ch);
  }

  const sessionIds = sessionList.map((s) => s.id);
  const attrBySession = new Map(attrList.map((a) => [a.session_id, a.lead_id]));

  const recentSessions: RecentSessionRow[] = sessionList.slice(0, 25).map((s) => {
    const camp = s.matched_campaign_id ? campaignMap.get(s.matched_campaign_id) : null;
    return {
      id: s.id,
      first_seen_at: s.first_seen_at,
      last_seen_at: s.last_seen_at,
      entry_page_url: s.entry_page_url,
      device_type: s.device_type,
      utm_source: s.utm_source,
      campaign_name: camp?.name ?? null,
      lead_id: attrBySession.get(s.id) ?? null,
    };
  });

  const sessionCount = sessionList.length;
  const attributedCount = attrList.length;
  const events = eventCount ?? 0;

  return {
    kpis: {
      sessions: sessionCount,
      events,
      attributed: attributedCount,
      conversionRate: sessionCount > 0 ? (attributedCount / sessionCount) * 100 : 0,
      avgEventsPerSession: sessionCount > 0 ? events / sessionCount : 0,
    },
    daily: Array.from(daily.values()),
    byChannel: Array.from(byChannel.values()).sort((a, b) => b.sessions - a.sessions),
    byCampaign: Array.from(byCampaign.values()).sort((a, b) => b.sessions - a.sessions),
    byUtm: Array.from(byUtm.values()).sort((a, b) => b.sessions - a.sessions).slice(0, 40),
    devices: Array.from(deviceMap.entries())
      .map(([device, count]) => ({ device, count }))
      .sort((a, b) => b.count - a.count) as DeviceSplit[],
    recentSessions,
    recentConversions: attrList.slice(0, 15),
    campaignMap,
    channelMap,
    sessionIdsSample: sessionIds.slice(0, 500),
  };
}

export async function fetchTopPages(
  supabase: SupabaseClient,
  range: RangeKey,
  limit = 40
): Promise<PageRow[]> {
  const since = rangeStartIso(range);
  const db = marketingAggClient(supabase);

  const { data: rpcRows, error: rpcError } = await db.rpc("marketing_top_pages", {
    p_since: since,
    p_limit: limit,
  });

  if (!rpcError && Array.isArray(rpcRows)) {
    return (rpcRows as PageRow[]).map((r) => ({
      page_url: r.page_url,
      pageviews: Number(r.pageviews) || 0,
      clicks: Number(r.clicks) || 0,
      scroll_25: Number(r.scroll_25) || 0,
      scroll_50: Number(r.scroll_50) || 0,
      scroll_75: Number(r.scroll_75) || 0,
      scroll_100: Number(r.scroll_100) || 0,
    }));
  }

  // Fallback if migration not applied — service role + keyset (never use user RLS here)
  type Ev = {
    id: string;
    page_url: string | null;
    event_type: string;
    element_selector: string | null;
    occurred_at: string;
  };

  const events = await fetchAllByTimeCursor<Ev>(
    (cursor) => {
      let q = db
        .from("page_events")
        .select("id, page_url, event_type, element_selector, occurred_at")
        .gte("occurred_at", since)
        .in("event_type", ["pageview", "click", "scroll_depth"])
        .order("occurred_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE_SIZE);
      if (cursor) {
        q = q.or(
          `occurred_at.lt."${cursor.at}",and(occurred_at.eq."${cursor.at}",id.lt."${cursor.id}")`
        );
      }
      return q;
    },
    (row) => row.occurred_at
  );

  const map = new Map<string, PageRow>();
  for (const ev of events) {
    const url = ev.page_url || "(unknown)";
    const row = map.get(url) ?? {
      page_url: url,
      pageviews: 0,
      clicks: 0,
      scroll_25: 0,
      scroll_50: 0,
      scroll_75: 0,
      scroll_100: 0,
    };
    if (ev.event_type === "pageview") row.pageviews += 1;
    else if (ev.event_type === "click") row.clicks += 1;
    else if (ev.event_type === "scroll_depth") {
      const sel = ev.element_selector || "";
      if (sel.includes("100")) row.scroll_100 += 1;
      else if (sel.includes("75")) row.scroll_75 += 1;
      else if (sel.includes("50")) row.scroll_50 += 1;
      else if (sel.includes("25")) row.scroll_25 += 1;
    }
    map.set(url, row);
  }

  return Array.from(map.values())
    .sort((a, b) => b.pageviews - a.pageviews)
    .slice(0, limit);
}

export async function fetchCampaignMetrics(
  supabase: SupabaseClient,
  range: RangeKey
): Promise<Map<string, { sessions: number; attributed: number }>> {
  const since = rangeStartIso(range);
  const db = marketingAggClient(supabase);

  // Prefer overview RPC campaign slice when available (one round-trip)
  const { data: rpcData, error: rpcError } = await db.rpc("marketing_overview", {
    p_since: since,
    p_range_days: Number(range),
  });
  if (!rpcError && rpcData && typeof rpcData === "object") {
    const byCampaign = (rpcData as { byCampaign?: NamedCount[] }).byCampaign ?? [];
    const map = new Map<string, { sessions: number; attributed: number }>();
    for (const row of byCampaign) {
      map.set(String(row.id), {
        sessions: Number(row.sessions) || 0,
        attributed: Number(row.attributed) || 0,
      });
    }
    return map;
  }

  const [sessions, attrs] = await Promise.all([
    fetchAllPages((from, to) =>
      db
        .from("visitor_sessions")
        .select("matched_campaign_id")
        .gte("first_seen_at", since)
        .not("matched_campaign_id", "is", null)
        .order("first_seen_at", { ascending: false })
        .range(from, to)
    ),
    fetchAllPages((from, to) =>
      db
        .from("lead_attribution")
        .select("first_touch_campaign_id")
        .gte("converted_at", since)
        .not("first_touch_campaign_id", "is", null)
        .order("converted_at", { ascending: false })
        .range(from, to)
    ),
  ]);

  const map = new Map<string, { sessions: number; attributed: number }>();
  for (const s of sessions) {
    const id = s.matched_campaign_id as string;
    const row = map.get(id) ?? { sessions: 0, attributed: 0 };
    row.sessions += 1;
    map.set(id, row);
  }
  for (const a of attrs) {
    const id = a.first_touch_campaign_id as string;
    const row = map.get(id) ?? { sessions: 0, attributed: 0 };
    row.attributed += 1;
    map.set(id, row);
  }
  return map;
}

export async function fetchAttributionForLeads(
  supabase: SupabaseClient,
  leadIds: string[]
): Promise<Map<string, AttributionSource>> {
  const map = new Map<string, AttributionSource>();
  if (!leadIds.length) return map;

  const { data } = await supabase
    .from("lead_attribution")
    .select("lead_id, first_touch_campaign_id")
    .in("lead_id", leadIds);

  const campaignIds = Array.from(
    new Set((data ?? []).map((d) => d.first_touch_campaign_id).filter(Boolean))
  ) as string[];

  if (!campaignIds.length) {
    for (const row of data ?? []) {
      map.set(row.lead_id, {
        lead_id: row.lead_id,
        campaign_name: null,
        channel_name: null,
      });
    }
    return map;
  }

  // One round-trip: campaigns + channel name
  const { data: camps } = await supabase
    .from("campaigns")
    .select("id, name, channel_id, channels(name)")
    .in("id", campaignIds);

  const campMap = new Map(
    (camps ?? []).map((c) => {
      const ch = c.channels as unknown as { name: string } | { name: string }[] | null;
      const channelName = Array.isArray(ch) ? ch[0]?.name ?? null : ch?.name ?? null;
      return [c.id, { name: c.name as string, channelName }] as const;
    })
  );

  for (const row of data ?? []) {
    const camp = row.first_touch_campaign_id
      ? campMap.get(row.first_touch_campaign_id)
      : null;
    map.set(row.lead_id, {
      lead_id: row.lead_id,
      campaign_name: camp?.name ?? null,
      channel_name: camp?.channelName ?? null,
    });
  }
  return map;
}

export async function fetchCounselorAttributionGlance(
  supabase: SupabaseClient,
  leadIds: string[]
) {
  if (!leadIds.length) {
    return {
      attributedCount: 0,
      totalLeads: 0,
      topSources: [] as { name: string; count: number }[],
      recent: [] as { lead_id: string; name: string; campaign: string | null; converted_at: string }[],
    };
  }

  const { data: attrs } = await supabase
    .from("lead_attribution")
    .select("lead_id, converted_at, first_touch_campaign_id")
    .in("lead_id", leadIds)
    .order("converted_at", { ascending: false })
    .limit(50);

  const attrList = attrs ?? [];
  const campaignIds = Array.from(
    new Set(attrList.map((a) => a.first_touch_campaign_id).filter(Boolean))
  ) as string[];

  const [{ data: camps }, { data: leads }] = await Promise.all([
    campaignIds.length
      ? supabase
          .from("campaigns")
          .select("id, name, channel_id, channels(name)")
          .in("id", campaignIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            name: string;
            channel_id: string;
            channels: unknown;
          }[],
        }),
    (() => {
      const recentLeadIds = attrList.slice(0, 8).map((a) => a.lead_id);
      return recentLeadIds.length
        ? supabase.from("leads").select("id, name").in("id", recentLeadIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] });
    })(),
  ]);

  const campMap = new Map(
    (camps ?? []).map((c) => {
      const ch = c.channels as unknown as { name: string } | { name: string }[] | null;
      const channelName = Array.isArray(ch) ? ch[0]?.name ?? null : ch?.name ?? null;
      return [
        c.id,
        { name: c.name as string, channel_id: c.channel_id as string, channelName },
      ] as const;
    })
  );
  const leadMap = new Map((leads ?? []).map((l) => [l.id, l.name]));

  const sourceCounts = new Map<string, number>();
  for (const a of attrList) {
    const camp = a.first_touch_campaign_id
      ? campMap.get(a.first_touch_campaign_id)
      : null;
    const label = camp
      ? `${camp.channelName ?? "—"} · ${camp.name}`
      : "Unattributed";
    sourceCounts.set(label, (sourceCounts.get(label) ?? 0) + 1);
  }

  return {
    attributedCount: attrList.length,
    totalLeads: leadIds.length,
    topSources: Array.from(sourceCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
    recent: attrList.slice(0, 8).map((a) => {
      const camp = a.first_touch_campaign_id
        ? campMap.get(a.first_touch_campaign_id)
        : null;
      return {
        lead_id: a.lead_id,
        name: leadMap.get(a.lead_id) ?? "Lead",
        campaign: camp?.name ?? null,
        converted_at: a.converted_at,
      };
    }),
  };
}

export type SessionListFilters = {
  range: RangeKey;
  converted?: "yes" | "no" | "all";
  device?: string;
  hasUtm?: "yes" | "no" | "all";
  q?: string;
};

export async function fetchSessionList(
  supabase: SupabaseClient,
  filters: SessionListFilters,
  limit = 100
) {
  const since = rangeStartIso(filters.range);
  let q = supabase
    .from("visitor_sessions")
    .select(
      "id, first_seen_at, last_seen_at, entry_page_url, referrer_url, device_type, browser, os, utm_source, utm_medium, utm_campaign, click_id, matched_campaign_id, matched_ad_creative_id"
    )
    .gte("first_seen_at", since)
    .order("first_seen_at", { ascending: false })
    .limit(limit);

  if (filters.device && filters.device !== "all") {
    q = q.eq("device_type", filters.device);
  }

  const { data: sessions } = await q;
  let list = sessions ?? [];

  if (filters.hasUtm === "yes") {
    list = list.filter((s) => s.utm_source || s.utm_medium || s.utm_campaign);
  } else if (filters.hasUtm === "no") {
    list = list.filter((s) => !s.utm_source && !s.utm_medium && !s.utm_campaign);
  }

  if (filters.q) {
    const needle = filters.q.toLowerCase();
    list = list.filter(
      (s) =>
        (s.entry_page_url || "").toLowerCase().includes(needle) ||
        (s.utm_campaign || "").toLowerCase().includes(needle) ||
        (s.utm_source || "").toLowerCase().includes(needle) ||
        s.id.toLowerCase().includes(needle)
    );
  }

  const [{ data: attrs }, { data: campaigns }] = await Promise.all([
    supabase
      .from("lead_attribution")
      .select("session_id, lead_id")
      .in(
        "session_id",
        list.map((s) => s.id).length ? list.map((s) => s.id) : ["00000000-0000-0000-0000-000000000000"]
      ),
    supabase.from("campaigns").select("id, name"),
  ]);

  const attrBySession = new Map((attrs ?? []).map((a) => [a.session_id, a.lead_id]));
  const campMap = new Map((campaigns ?? []).map((c) => [c.id, c.name]));

  let rows = list.map((s) => ({
    ...s,
    campaign_name: s.matched_campaign_id
      ? campMap.get(s.matched_campaign_id) ?? null
      : null,
    lead_id: attrBySession.get(s.id) ?? null,
  }));

  if (filters.converted === "yes") rows = rows.filter((r) => r.lead_id);
  else if (filters.converted === "no") rows = rows.filter((r) => !r.lead_id);

  return rows;
}

export async function fetchSessionDetail(supabase: SupabaseClient, sessionId: string) {
  const { data: session } = await supabase
    .from("visitor_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) return null;

  const [{ data: events }, { data: attr }, { data: campaign }, { data: creative }] =
    await Promise.all([
      supabase
        .from("page_events")
        .select("*")
        .eq("session_id", sessionId)
        .order("occurred_at", { ascending: true })
        .limit(300),
      supabase
        .from("lead_attribution")
        .select("lead_id, converted_at, first_touch_campaign_id")
        .eq("session_id", sessionId)
        .maybeSingle(),
      session.matched_campaign_id
        ? supabase
            .from("campaigns")
            .select("id, name, channel_id, source_type, channels(name)")
            .eq("id", session.matched_campaign_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      session.matched_ad_creative_id
        ? supabase
            .from("ad_creatives")
            .select("creative_name, tracked_slug")
            .eq("id", session.matched_ad_creative_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const chJoin = campaign
    ? (campaign.channels as unknown as { name: string } | { name: string }[] | null)
    : null;
  const channelName = Array.isArray(chJoin)
    ? chJoin[0]?.name ?? null
    : chJoin?.name ?? null;

  let leadName: string | null = null;
  if (attr?.lead_id) {
    const { data: lead } = await supabase
      .from("leads")
      .select("name, stage")
      .eq("id", attr.lead_id)
      .maybeSingle();
    leadName = lead ? `${lead.name} (${lead.stage})` : null;
  }

  return {
    session,
    events: events ?? [],
    attribution: attr,
    campaign,
    channelName,
    creative,
    leadName,
  };
}

export async function fetchConversionsList(
  supabase: SupabaseClient,
  range: RangeKey,
  limit = 80
) {
  const since = rangeStartIso(range);
  const { data: attrs } = await supabase
    .from("lead_attribution")
    .select(
      "id, lead_id, session_id, converted_at, first_touch_campaign_id, last_touch_campaign_id, first_touch_at"
    )
    .gte("converted_at", since)
    .order("converted_at", { ascending: false })
    .limit(limit);

  const list = attrs ?? [];
  const leadIds = list.map((a) => a.lead_id);
  const campIds = Array.from(
    new Set(
      list
        .flatMap((a) => [a.first_touch_campaign_id, a.last_touch_campaign_id])
        .filter(Boolean)
    )
  ) as string[];

  const [{ data: leads }, { data: camps }] = await Promise.all([
    leadIds.length
      ? supabase.from("leads").select("id, name, stage, phone").in("id", leadIds)
      : Promise.resolve({
          data: [] as { id: string; name: string; stage: string; phone: string }[],
        }),
    campIds.length
      ? supabase
          .from("campaigns")
          .select("id, name, channel_id, channels(name)")
          .in("id", campIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            name: string;
            channel_id: string;
            channels: unknown;
          }[],
        }),
  ]);

  const leadMap = new Map((leads ?? []).map((l) => [l.id, l]));
  const campMap = new Map(
    (camps ?? []).map((c) => {
      const ch = c.channels as unknown as { name: string } | { name: string }[] | null;
      const channelName = Array.isArray(ch) ? ch[0]?.name ?? null : ch?.name ?? null;
      return [c.id, { name: c.name as string, channelName }] as const;
    })
  );

  return list.map((a) => {
    const lead = leadMap.get(a.lead_id);
    const first = a.first_touch_campaign_id
      ? campMap.get(a.first_touch_campaign_id)
      : null;
    return {
      ...a,
      lead_name: lead?.name ?? "Lead",
      lead_stage: lead?.stage ?? null,
      lead_phone: lead?.phone ?? null,
      campaign_name: first?.name ?? null,
      channel_name: first?.channelName ?? null,
    };
  });
}

