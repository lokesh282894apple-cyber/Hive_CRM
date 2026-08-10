import type { SupabaseClient } from "@supabase/supabase-js";

export type RangeKey = "7" | "30" | "90";

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

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function emptyDays(range: RangeKey): Map<string, DailyPoint> {
  const map = new Map<string, DailyPoint>();
  const n = Number(range);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - n);
  for (let i = 0; i <= n; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    map.set(key, { date: key, sessions: 0, conversions: 0 });
  }
  return map;
}

export async function fetchMarketingOverview(
  supabase: SupabaseClient,
  range: RangeKey
) {
  const since = rangeStartIso(range);

  const [
    { data: sessions },
    { count: eventCount },
    { data: attributions },
    { data: campaigns },
    { data: channels },
  ] = await Promise.all([
    supabase
      .from("visitor_sessions")
      .select(
        "id, first_seen_at, last_seen_at, entry_page_url, device_type, utm_source, utm_medium, utm_campaign, matched_campaign_id"
      )
      .gte("first_seen_at", since)
      .order("first_seen_at", { ascending: false })
      .limit(3000),
    supabase
      .from("page_events")
      .select("*", { count: "exact", head: true })
      .gte("occurred_at", since),
    supabase
      .from("lead_attribution")
      .select(
        "id, lead_id, session_id, converted_at, first_touch_campaign_id, last_touch_campaign_id"
      )
      .gte("converted_at", since)
      .order("converted_at", { ascending: false })
      .limit(1500),
    supabase.from("campaigns").select("id, name, channel_id, source_type, status"),
    supabase.from("channels").select("id, name"),
  ]);

  const sessionList = sessions ?? [];
  const attrList = attributions ?? [];
  const campaignMap = new Map((campaigns ?? []).map((c) => [c.id, c]));
  const channelMap = new Map((channels ?? []).map((c) => [c.id, c.name]));

  const attributedSessionIds = new Set(attrList.map((a) => a.session_id));

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

    const channelId = camp.channel_id;
    const ch = byChannel.get(channelId) ?? {
      id: channelId,
      name: channelMap.get(channelId) ?? "—",
      sessions: 0,
      attributed: 0,
    };
    ch.attributed = Math.max(ch.attributed, (ch.attributed || 0));
    byChannel.set(channelId, ch);
  }

  // Recalc channel attributed from campaign rollup for consistency
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
  const { data: events } = await supabase
    .from("page_events")
    .select("page_url, event_type, element_selector")
    .gte("occurred_at", since)
    .limit(6000);

  const map = new Map<string, PageRow>();
  for (const ev of events ?? []) {
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
  const [{ data: sessions }, { data: attrs }] = await Promise.all([
    supabase
      .from("visitor_sessions")
      .select("matched_campaign_id")
      .gte("first_seen_at", since)
      .not("matched_campaign_id", "is", null)
      .limit(3000),
    supabase
      .from("lead_attribution")
      .select("first_touch_campaign_id")
      .gte("converted_at", since)
      .not("first_touch_campaign_id", "is", null)
      .limit(1500),
  ]);

  const map = new Map<string, { sessions: number; attributed: number }>();
  for (const s of sessions ?? []) {
    const id = s.matched_campaign_id as string;
    const row = map.get(id) ?? { sessions: 0, attributed: 0 };
    row.sessions += 1;
    map.set(id, row);
  }
  for (const a of attrs ?? []) {
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

  const { data: camps } = campaignIds.length
    ? await supabase.from("campaigns").select("id, name, channel_id").in("id", campaignIds)
    : { data: [] as { id: string; name: string; channel_id: string }[] };

  const channelIds = Array.from(new Set((camps ?? []).map((c) => c.channel_id)));
  const { data: channels } = channelIds.length
    ? await supabase.from("channels").select("id, name").in("id", channelIds)
    : { data: [] as { id: string; name: string }[] };

  const campMap = new Map((camps ?? []).map((c) => [c.id, c]));
  const chMap = new Map((channels ?? []).map((c) => [c.id, c.name]));

  for (const row of data ?? []) {
    const camp = row.first_touch_campaign_id
      ? campMap.get(row.first_touch_campaign_id)
      : null;
    map.set(row.lead_id, {
      lead_id: row.lead_id,
      campaign_name: camp?.name ?? null,
      channel_name: camp ? chMap.get(camp.channel_id) ?? null : null,
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

  const { data: camps } = campaignIds.length
    ? await supabase.from("campaigns").select("id, name, channel_id").in("id", campaignIds)
    : { data: [] as { id: string; name: string; channel_id: string }[] };

  const channelIds = Array.from(new Set((camps ?? []).map((c) => c.channel_id)));
  const { data: channels } = channelIds.length
    ? await supabase.from("channels").select("id, name").in("id", channelIds)
    : { data: [] as { id: string; name: string }[] };

  const campMap = new Map((camps ?? []).map((c) => [c.id, c]));
  const chMap = new Map((channels ?? []).map((c) => [c.id, c.name]));

  const sourceCounts = new Map<string, number>();
  for (const a of attrList) {
    const camp = a.first_touch_campaign_id
      ? campMap.get(a.first_touch_campaign_id)
      : null;
    const label = camp
      ? `${chMap.get(camp.channel_id) ?? "—"} · ${camp.name}`
      : "Unattributed";
    sourceCounts.set(label, (sourceCounts.get(label) ?? 0) + 1);
  }

  const recentLeadIds = attrList.slice(0, 8).map((a) => a.lead_id);
  const { data: leads } = recentLeadIds.length
    ? await supabase.from("leads").select("id, name").in("id", recentLeadIds)
    : { data: [] as { id: string; name: string }[] };
  const leadMap = new Map((leads ?? []).map((l) => [l.id, l.name]));

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
            .select("id, name, channel_id, source_type")
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

  let channelName: string | null = null;
  if (campaign?.channel_id) {
    const { data: ch } = await supabase
      .from("channels")
      .select("name")
      .eq("id", campaign.channel_id)
      .maybeSingle();
    channelName = ch?.name ?? null;
  }

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
      : Promise.resolve({ data: [] as { id: string; name: string; stage: string; phone: string }[] }),
    campIds.length
      ? supabase.from("campaigns").select("id, name, channel_id").in("id", campIds)
      : Promise.resolve({ data: [] as { id: string; name: string; channel_id: string }[] }),
  ]);

  const channelIds = Array.from(new Set((camps ?? []).map((c) => c.channel_id)));
  const { data: channels } = channelIds.length
    ? await supabase.from("channels").select("id, name").in("id", channelIds)
    : { data: [] as { id: string; name: string }[] };

  const leadMap = new Map((leads ?? []).map((l) => [l.id, l]));
  const campMap = new Map((camps ?? []).map((c) => [c.id, c]));
  const chMap = new Map((channels ?? []).map((c) => [c.id, c.name]));

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
      channel_name: first ? chMap.get(first.channel_id) ?? null : null,
    };
  });
}

