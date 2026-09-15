import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  blendedCpl,
  cpaql,
  costPerR1,
  cpm,
  cpc,
  ctr,
  hookRate,
  isInorganicLead,
  isMetaFormsLead,
  liveCac,
  liveCpa,
  pct,
  roas,
  roiPct,
  tofuPct,
  mofuPct,
} from "@/lib/marketing/metrics";
import { meetsAqlCriteria } from "@/lib/marketing/aql";

function db(): SupabaseClient {
  return createAdminClient();
}

/** PostgREST `.in()` URL length + row caps — chunk ids and fetch in parallel batches. */
const IN_CHUNK = 150;
const IN_CONCURRENCY = 4;

async function selectInChunks<T extends Record<string, unknown>>(
  table: string,
  idColumn: string,
  ids: string[],
  columns: string
): Promise<T[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return [];
  const admin = db();
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += IN_CHUNK) {
    chunks.push(unique.slice(i, i + IN_CHUNK));
  }
  const out: T[] = [];
  for (let i = 0; i < chunks.length; i += IN_CONCURRENCY) {
    const batch = chunks.slice(i, i + IN_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (chunk) => {
        const { data } = await admin.from(table).select(columns).in(idColumn, chunk);
        return (data ?? []) as unknown as T[];
      })
    );
    for (const rows of results) out.push(...rows);
  }
  return out;
}

export type MarketingFilters = {
  fromDate: string;
  toDate: string;
  programme?: string | null;
  cohortId?: string | null;
  channel?: string | null;
  organicOnly?: boolean;
  inorganicOnly?: boolean;
};

export function parseMarketingFilters(sp: Record<string, string | undefined>): MarketingFilters {
  const today = new Date();
  const to = sp.to ?? today.toISOString().slice(0, 10);
  const fromDefault = new Date(today);
  fromDefault.setDate(fromDefault.getDate() - 30);
  const from = sp.from ?? fromDefault.toISOString().slice(0, 10);
  return {
    fromDate: from,
    toDate: to,
    programme: sp.programme || null,
    cohortId: sp.cohort || null,
    channel: sp.channel || null,
    organicOnly: sp.organic === "1",
    inorganicOnly: sp.inorganic === "1",
  };
}

function inRange(iso: string, from: string, to: string): boolean {
  const d = iso.slice(0, 10);
  return d >= from && d <= to;
}

const R1_BOOKED_STAGES = new Set(["r1_booked", "r1_confirmed"]);
const R1_DONE_STAGES = new Set([
  "r1_confirmed",
  "r2_booked",
  "r2_tbb",
  "r3_booked",
  "yet_to_offer",
  "offered",
  "closed_won",
]);

export type FunnelDayRow = {
  date: string;
  sessions: number;
  metaSpend: number;
  nonMetaSpend: number;
  totalSpend: number;
  leads: number;
  organicLeads: number;
  inorganicLeads: number;
  aqlOrganic: number;
  aqlInorganic: number;
  aqlTotal: number;
  r1Booked: number;
  r1Completed: number;
  sessionsToLeadsPct: number | null;
  blendedCpl: number | null;
  blendedCpaql: number | null;
  costPerR1: number | null;
};

export async function fetchLeadFunnel(filters: MarketingFilters): Promise<FunnelDayRow[]> {
  const admin = db();
  const fromIso = `${filters.fromDate}T00:00:00.000Z`;
  const toIso = `${filters.toDate}T23:59:59.999Z`;

  const [sessionsRes, leadsRes, historyRes, spendRes, costRes, campsRes] = await Promise.all([
    admin
      .from("visitor_sessions")
      .select("id, first_seen_at")
      .gte("first_seen_at", fromIso)
      .lte("first_seen_at", toIso),
    admin
      .from("leads")
      .select(
        "id, created_at, programme, cohort_id, source, utm_medium, aql_at, qualification_intent, financial_check, stage"
      )
      .gte("created_at", fromIso)
      .lte("created_at", toIso),
    admin
      .from("stage_history")
      .select("lead_id, to_stage, changed_at")
      .gte("changed_at", fromIso)
      .lte("changed_at", toIso),
    admin
      .from("ad_spend_daily")
      .select("date, spend")
      .gte("date", filters.fromDate)
      .lte("date", filters.toDate),
    admin
      .from("marketing_cost_entries")
      .select("entry_date, amount_inr, is_organic")
      .gte("entry_date", filters.fromDate)
      .lte("entry_date", filters.toDate),
    admin.from("campaigns").select("id, source_type"),
  ]);

  const leadIds = (leadsRes.data ?? []).map((l) => l.id as string);
  const attrs = await selectInChunks<{
    lead_id: string;
    first_touch_campaign_id: string | null;
  }>("lead_attribution", "lead_id", leadIds, "lead_id, first_touch_campaign_id");

  const campMap = new Map(
    (campsRes.data ?? []).map((c) => [c.id as string, c.source_type as string])
  );
  const attrMap = new Map(
    attrs.map((a) => [a.lead_id as string, a.first_touch_campaign_id as string])
  );

  const dayMap = new Map<string, FunnelDayRow>();
  const ensure = (date: string): FunnelDayRow => {
    let row = dayMap.get(date);
    if (!row) {
      row = {
        date,
        sessions: 0,
        metaSpend: 0,
        nonMetaSpend: 0,
        totalSpend: 0,
        leads: 0,
        organicLeads: 0,
        inorganicLeads: 0,
        aqlOrganic: 0,
        aqlInorganic: 0,
        aqlTotal: 0,
        r1Booked: 0,
        r1Completed: 0,
        sessionsToLeadsPct: null,
        blendedCpl: null,
        blendedCpaql: null,
        costPerR1: null,
      };
      dayMap.set(date, row);
    }
    return row;
  };

  for (const s of sessionsRes.data ?? []) {
    const d = String(s.first_seen_at).slice(0, 10);
    ensure(d).sessions += 1;
  }

  for (const sp of spendRes.data ?? []) {
    const d = String(sp.date);
    ensure(d).metaSpend += Number(sp.spend) || 0;
  }

  for (const c of costRes.data ?? []) {
    const d = String(c.entry_date);
    const amt = Number(c.amount_inr) || 0;
    if (c.is_organic) ensure(d).nonMetaSpend += amt;
    else ensure(d).metaSpend += amt;
  }

  for (const l of leadsRes.data ?? []) {
    if (filters.programme && l.programme !== filters.programme) continue;
    if (filters.cohortId && l.cohort_id !== filters.cohortId) continue;
    const d = String(l.created_at).slice(0, 10);
    const campId = attrMap.get(l.id);
    const inorg = isInorganicLead({
      utm_medium: l.utm_medium,
      source: l.source,
      campaignSourceType: campId ? campMap.get(campId) : null,
    });
    if (filters.organicOnly && inorg) continue;
    if (filters.inorganicOnly && !inorg) continue;
    const row = ensure(d);
    row.leads += 1;
    if (inorg) row.inorganicLeads += 1;
    else row.organicLeads += 1;
  }

  for (const l of leadsRes.data ?? []) {
    const aqlDate = l.aql_at
      ? String(l.aql_at).slice(0, 10)
      : meetsAqlCriteria(l)
        ? String(l.created_at).slice(0, 10)
        : null;
    if (!aqlDate || !inRange(aqlDate, filters.fromDate, filters.toDate)) continue;
    const campId = attrMap.get(l.id);
    const inorg = isInorganicLead({
      utm_medium: l.utm_medium,
      source: l.source,
      campaignSourceType: campId ? campMap.get(campId) : null,
    });
    const row = ensure(aqlDate);
    row.aqlTotal += 1;
    if (inorg) row.aqlInorganic += 1;
    else row.aqlOrganic += 1;
  }

  const r1BookedLeads = new Set<string>();
  const r1DoneLeads = new Set<string>();
  for (const h of historyRes.data ?? []) {
    const d = String(h.changed_at).slice(0, 10);
    if (R1_BOOKED_STAGES.has(h.to_stage) && !r1BookedLeads.has(`${h.lead_id}:${d}`)) {
      r1BookedLeads.add(`${h.lead_id}:${d}`);
      ensure(d).r1Booked += 1;
    }
    if (R1_DONE_STAGES.has(h.to_stage) && !r1DoneLeads.has(`${h.lead_id}:${d}`)) {
      r1DoneLeads.add(`${h.lead_id}:${d}`);
      ensure(d).r1Completed += 1;
    }
  }

  const rows = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  for (const row of rows) {
    row.totalSpend = row.metaSpend + row.nonMetaSpend;
    row.sessionsToLeadsPct = pct(row.leads, row.sessions);
    row.blendedCpl = blendedCpl(row.totalSpend, row.leads);
    row.blendedCpaql = cpaql(row.totalSpend, row.aqlTotal);
    row.costPerR1 = costPerR1(row.totalSpend, row.r1Booked);
  }
  return rows;
}

export type QualificationLeadRow = {
  id: string;
  name: string;
  leadDate: string;
  programme: string | null;
  intent: string | null;
  financialCheck: string | null;
  source: string | null;
  campaign: string | null;
  adSet: string | null;
  ad: string | null;
  status: string;
  dqReason: string | null;
  counsellorId: string | null;
  aqlAt: string | null;
};

export async function fetchQualificationLeads(
  filters: MarketingFilters
): Promise<QualificationLeadRow[]> {
  const admin = db();
  const { data } = await admin
    .from("leads")
    .select(
      "id, name, created_at, programme, qualification_intent, financial_check, source, meta_campaign_name, meta_ad_set, meta_ad_name, stage, dq_reason, lead_allocated_to, aql_at, utm_campaign"
    )
    .gte("created_at", `${filters.fromDate}T00:00:00.000Z`)
    .lte("created_at", `${filters.toDate}T23:59:59.999Z`)
    .order("created_at", { ascending: false })
    .limit(500);

  return (data ?? [])
    .filter((l) => !filters.programme || l.programme === filters.programme)
    .map((l) => ({
      id: l.id,
      name: l.name,
      leadDate: String(l.created_at).slice(0, 10),
      programme: l.programme,
      intent: l.qualification_intent,
      financialCheck: l.financial_check,
      source: l.source,
      campaign: l.meta_campaign_name ?? l.utm_campaign,
      adSet: l.meta_ad_set,
      ad: l.meta_ad_name,
      status: l.stage,
      dqReason: l.dq_reason,
      counsellorId: l.lead_allocated_to,
      aqlAt: l.aql_at,
    }));
}

export type DqReasonRow = { reason: string; count: number; pct: number };

export function aggregateDqReasons(leads: QualificationLeadRow[]): DqReasonRow[] {
  const counts = new Map<string, number>();
  for (const l of leads) {
    if (!l.dqReason) continue;
    counts.set(l.dqReason, (counts.get(l.dqReason) ?? 0) + 1);
  }
  const total = Array.from(counts.values()).reduce((s, n) => s + n, 0);
  return Array.from(counts.entries())
    .map(([reason, count]) => ({
      reason,
      count,
      pct: total ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

export type AttributionRow = {
  key: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  leads: number;
  aql: number;
  r1: number;
  enrolled: number;
  revenue: number;
};

export async function fetchAttributionReport(
  filters: MarketingFilters,
  model: "first" | "last" = "first"
): Promise<AttributionRow[]> {
  const admin = db();
  const { data: leads } = await admin
    .from("leads")
    .select(
      "id, stage, aql_at, qualification_intent, financial_check, utm_source, utm_medium, utm_campaign, created_at"
    )
    .gte("created_at", `${filters.fromDate}T00:00:00.000Z`)
    .lte("created_at", `${filters.toDate}T23:59:59.999Z`);

  const leadList = leads ?? [];
  if (!leadList.length) return [];

  const leadIds = leadList.map((l) => l.id as string);
  const attrs = await selectInChunks<{
    lead_id: string;
    first_touch_campaign_id: string | null;
    last_touch_campaign_id: string | null;
    session_id: string | null;
  }>(
    "lead_attribution",
    "lead_id",
    leadIds,
    "lead_id, first_touch_campaign_id, last_touch_campaign_id, session_id"
  );

  const attrByLead = new Map(attrs.map((a) => [a.lead_id, a]));
  const sessionIds = attrs
    .map((a) => a.session_id)
    .filter((id): id is string => Boolean(id));
  const sessions = await selectInChunks<{
    id: string;
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
  }>("visitor_sessions", "id", sessionIds, "id, utm_source, utm_medium, utm_campaign");

  const sessMap = new Map(sessions.map((s) => [s.id, s]));
  const agg = new Map<string, AttributionRow>();
  const leadKey = new Map<string, string>();

  for (const l of leadList) {
    const attr = attrByLead.get(l.id);
    let src = l.utm_source as string | null;
    let med = l.utm_medium as string | null;
    let camp = l.utm_campaign as string | null;
    if (attr?.session_id) {
      const sess = sessMap.get(attr.session_id);
      if (sess) {
        if (model === "first" || !src) src = sess.utm_source;
        if (model === "first" || !med) med = sess.utm_medium;
        if (model === "first" || !camp) camp = sess.utm_campaign;
      }
    }
    const key = `${src ?? "direct"}|${med ?? "none"}|${camp ?? "none"}`;
    leadKey.set(l.id, key);
    let row = agg.get(key);
    if (!row) {
      row = {
        key,
        utmSource: src,
        utmMedium: med,
        utmCampaign: camp,
        leads: 0,
        aql: 0,
        r1: 0,
        enrolled: 0,
        revenue: 0,
      };
      agg.set(key, row);
    }
    row.leads += 1;
    if (l.aql_at || meetsAqlCriteria(l)) row.aql += 1;
    if (R1_BOOKED_STAGES.has(l.stage) || R1_DONE_STAGES.has(l.stage)) row.r1 += 1;
    if (l.stage === "closed_won") row.enrolled += 1;
  }

  const wonIds = leadList.filter((l) => l.stage === "closed_won").map((l) => l.id as string);
  if (wonIds.length) {
    const fees = await selectInChunks<{
      lead_id: string;
      total_fee: number | null;
      remaining_fee: number | null;
    }>("fee_records", "lead_id", wonIds, "lead_id, total_fee, remaining_fee");
    for (const f of fees) {
      const realised = (Number(f.total_fee) || 0) - (Number(f.remaining_fee) || 0);
      const key = leadKey.get(f.lead_id);
      if (!key) continue;
      const row = agg.get(key);
      if (row) row.revenue += realised;
    }
  }

  return Array.from(agg.values()).sort((a, b) => b.leads - a.leads);
}

export type CampaignRoiRow = {
  campaignId: string | null;
  campaignName: string;
  channel: string | null;
  spend: number;
  leads: number;
  aql: number;
  r1Booked: number;
  enrolments: number;
  revenue: number;
  cpl: number | null;
  cac: number | null;
  roas: number | null;
  roiPct: number | null;
};

export async function fetchCampaignRoi(filters: MarketingFilters): Promise<CampaignRoiRow[]> {
  const admin = db();
  const [campaignsRes, spendRes, leadsRes] = await Promise.all([
    admin.from("campaigns").select("id, name, channel_id, source_type, channels(name)"),
    admin
      .from("ad_spend_daily")
      .select("campaign_id, spend, date")
      .gte("date", filters.fromDate)
      .lte("date", filters.toDate),
    admin
      .from("leads")
      .select("id, stage, aql_at, qualification_intent, financial_check")
      .gte("created_at", `${filters.fromDate}T00:00:00.000Z`)
      .lte("created_at", `${filters.toDate}T23:59:59.999Z`),
  ]);

  const campaigns = campaignsRes.data ?? [];
  const spendRows = spendRes.data ?? [];
  const leads = leadsRes.data ?? [];
  const leadMap = new Map(leads.map((l) => [l.id as string, l]));
  const leadIds = leads.map((l) => l.id as string);

  const attrs = await selectInChunks<{
    lead_id: string;
    first_touch_campaign_id: string | null;
  }>("lead_attribution", "lead_id", leadIds, "lead_id, first_touch_campaign_id");

  const spendByCamp = new Map<string, number>();
  for (const s of spendRows) {
    if (!s.campaign_id) continue;
    spendByCamp.set(s.campaign_id, (spendByCamp.get(s.campaign_id) ?? 0) + Number(s.spend));
  }

  const stats = new Map<
    string,
    { leads: number; aql: number; r1: number; enrolled: number; revenue: number }
  >();
  const attrByLead = new Map<string, string>();

  for (const a of attrs) {
    const cid = a.first_touch_campaign_id;
    if (!cid) continue;
    attrByLead.set(a.lead_id, cid);
    const l = leadMap.get(a.lead_id);
    if (!l) continue;
    const st = stats.get(cid) ?? { leads: 0, aql: 0, r1: 0, enrolled: 0, revenue: 0 };
    st.leads += 1;
    if (l.aql_at || meetsAqlCriteria(l)) st.aql += 1;
    if (R1_BOOKED_STAGES.has(l.stage) || R1_DONE_STAGES.has(l.stage)) st.r1 += 1;
    if (l.stage === "closed_won") st.enrolled += 1;
    stats.set(cid, st);
  }

  const enrolledIds = leads.filter((l) => l.stage === "closed_won").map((l) => l.id as string);
  if (enrolledIds.length) {
    const fees = await selectInChunks<{
      lead_id: string;
      total_fee: number | null;
      remaining_fee: number | null;
    }>("fee_records", "lead_id", enrolledIds, "lead_id, total_fee, remaining_fee");
    for (const f of fees) {
      const realised = (Number(f.total_fee) || 0) - (Number(f.remaining_fee) || 0);
      const cid = attrByLead.get(f.lead_id);
      if (!cid) continue;
      const st = stats.get(cid);
      if (st) st.revenue += realised;
    }
  }

  return campaigns
    .map((c) => {
      const st = stats.get(c.id) ?? { leads: 0, aql: 0, r1: 0, enrolled: 0, revenue: 0 };
      const spend = spendByCamp.get(c.id) ?? 0;
      const ch = c.channels as { name?: string } | null;
      return {
        campaignId: c.id,
        campaignName: c.name,
        channel: ch?.name ?? null,
        spend,
        leads: st.leads,
        aql: st.aql,
        r1Booked: st.r1,
        enrolments: st.enrolled,
        revenue: st.revenue,
        cpl: blendedCpl(spend, st.leads),
        cac: blendedCpl(spend, st.enrolled),
        roas: roas(st.revenue, spend),
        roiPct: roiPct(st.revenue, spend),
      };
    })
    .filter((r) => r.leads > 0 || r.spend > 0)
    .sort((a, b) => (b.roiPct ?? -999) - (a.roiPct ?? -999));
}

export type AdInsightRow = {
  id: string;
  weekLabel: string;
  campaignName: string;
  adSetName: string | null;
  adName: string;
  spend: number;
  results: number;
  costPerResult: number | null;
  impressions: number;
  linkClicks: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  hookRate: number | null;
  needsReview: boolean;
};

export async function fetchAdInsights(filters: MarketingFilters): Promise<AdInsightRow[]> {
  const admin = db();
  const { data } = await admin
    .from("ad_insights_weekly")
    .select("*")
    .gte("week_start", filters.fromDate)
    .lte("week_start", filters.toDate)
    .order("spend", { ascending: false });

  const rows = (data ?? []).map((r) => {
    const spend = Number(r.spend) || 0;
    const results = Number(r.results) || 0;
    const impressions = Number(r.impressions) || 0;
    const clicks = Number(r.link_clicks) || 0;
    const v3 = Number(r.video_plays_3s) || 0;
    return {
      id: r.id,
      weekLabel: r.week_label,
      campaignName: r.campaign_name,
      adSetName: r.ad_set_name,
      adName: r.ad_name,
      spend,
      results,
      costPerResult: results ? spend / results : null,
      impressions,
      linkClicks: clicks,
      ctr: ctr(clicks, impressions),
      cpc: cpc(spend, clicks),
      cpm: cpm(spend, impressions),
      hookRate: hookRate(v3, impressions),
      needsReview: false,
    };
  });

  const costs = rows.map((r) => r.costPerResult).filter((v): v is number => v != null);
  const median =
    costs.length ? costs.sort((a, b) => a - b)[Math.floor(costs.length / 2)] : null;

  return rows.map((r) => ({
    ...r,
    needsReview:
      (r.ctr != null && r.ctr < 1) ||
      (median != null && r.costPerResult != null && r.costPerResult > median * 1.3),
  }));
}

export type MonthlyMktRow = {
  monthKey: string;
  status: "live" | "closed";
  metaSpend: number;
  nonMetaSpend: number;
  totalSpend: number;
  salesCost: number;
  visitors: number;
  leads: number;
  aql: number;
  r1Booked: number;
  r1Completed: number;
  offers: number;
  converts: number;
  revenue: number;
  cpl: number | null;
  cpaql: number | null;
  costPerR1: number | null;
  liveCpa: number | null;
  liveCac: number | null;
  roasVal: number | null;
};

export async function fetchMonthlyMarketingData(
  monthsBack = 6
): Promise<MonthlyMktRow[]> {
  const admin = db();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const oldest = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const fromDate = `${oldest.getFullYear()}-${String(oldest.getMonth() + 1).padStart(2, "0")}-01`;
  const toDate = now.toISOString().slice(0, 10);
  const fromIso = `${fromDate}T00:00:00.000Z`;
  const toIso = `${toDate}T23:59:59.999Z`;

  const monthKeys: string[] = [];
  for (let i = monthsBack; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    );
  }

  const emptyTotals = () => ({
    sessions: 0,
    leads: 0,
    aql: 0,
    r1Booked: 0,
    r1Completed: 0,
    metaSpend: 0,
    nonMetaSpend: 0,
    offers: 0,
    converts: 0,
    revenue: 0,
  });
  const byMonth = new Map(monthKeys.map((k) => [k, emptyTotals()]));

  const [funnel, offeredLeads, wonLeads, fees] = await Promise.all([
    fetchLeadFunnel({ fromDate, toDate }),
    admin
      .from("leads")
      .select("updated_at")
      .eq("stage", "offered")
      .gte("updated_at", fromIso)
      .lte("updated_at", toIso),
    admin
      .from("leads")
      .select("updated_at")
      .eq("stage", "closed_won")
      .gte("updated_at", fromIso)
      .lte("updated_at", toIso),
    admin
      .from("fee_records")
      .select("total_fee, remaining_fee, updated_at")
      .gte("updated_at", fromIso)
      .lte("updated_at", toIso),
  ]);

  for (const r of funnel) {
    const mk = r.date.slice(0, 7);
    const t = byMonth.get(mk);
    if (!t) continue;
    t.sessions += r.sessions;
    t.leads += r.leads;
    t.aql += r.aqlTotal;
    t.r1Booked += r.r1Booked;
    t.r1Completed += r.r1Completed;
    t.metaSpend += r.metaSpend;
    t.nonMetaSpend += r.nonMetaSpend;
  }

  for (const l of offeredLeads.data ?? []) {
    const mk = String(l.updated_at).slice(0, 7);
    const t = byMonth.get(mk);
    if (t) t.offers += 1;
  }
  for (const l of wonLeads.data ?? []) {
    const mk = String(l.updated_at).slice(0, 7);
    const t = byMonth.get(mk);
    if (t) t.converts += 1;
  }
  for (const f of fees.data ?? []) {
    const mk = String(f.updated_at).slice(0, 7);
    const t = byMonth.get(mk);
    if (!t) continue;
    t.revenue += (Number(f.total_fee) || 0) - (Number(f.remaining_fee) || 0);
  }

  const salesCost = 60000;
  return monthKeys.map((monthKey) => {
    const totals = byMonth.get(monthKey) ?? emptyTotals();
    const totalSpend = totals.metaSpend + totals.nonMetaSpend;
    const conv = totals.converts;
    return {
      monthKey,
      status: monthKey === currentMonth ? "live" : "closed",
      metaSpend: totals.metaSpend,
      nonMetaSpend: totals.nonMetaSpend,
      totalSpend,
      salesCost,
      visitors: totals.sessions,
      leads: totals.leads,
      aql: totals.aql,
      r1Booked: totals.r1Booked,
      r1Completed: totals.r1Completed,
      offers: totals.offers,
      converts: conv,
      revenue: totals.revenue,
      cpl: blendedCpl(totalSpend, totals.leads),
      cpaql: cpaql(totalSpend, totals.aql),
      costPerR1: costPerR1(totalSpend, totals.r1Booked),
      liveCpa: liveCpa(totalSpend, conv),
      liveCac: liveCac(totalSpend, salesCost, conv),
      roasVal: roas(totals.revenue, totalSpend),
    };
  });
}

export type PnlSection = "total" | "organic" | "inorganic" | "meta_forms";

export type PnlStageRow = {
  stage: string;
  months: Record<string, number>;
  cohortTotal: number;
};

export async function fetchMarketingPnl(
  cohortId: string | null,
  section: PnlSection
): Promise<{ stages: PnlStageRow[]; metrics: Record<string, number> }> {
  const admin = db();
  let q = admin
    .from("leads")
    .select(
      "id, stage, source, utm_medium, created_at, cohort_id, aql_at, qualification_intent, financial_check"
    );
  if (cohortId) q = q.eq("cohort_id", cohortId);
  const [{ data: leads }, { data: camps }] = await Promise.all([
    q,
    admin.from("campaigns").select("id, source_type"),
  ]);

  const leadList = leads ?? [];
  const campMap = new Map((camps ?? []).map((c) => [c.id as string, c.source_type as string]));
  const attrs = await selectInChunks<{
    lead_id: string;
    first_touch_campaign_id: string | null;
  }>(
    "lead_attribution",
    "lead_id",
    leadList.map((l) => l.id as string),
    "lead_id, first_touch_campaign_id"
  );
  const attrMap = new Map(attrs.map((a) => [a.lead_id, a.first_touch_campaign_id]));

  const filtered = leadList.filter((l) => {
    const campId = attrMap.get(l.id);
    const inorg = isInorganicLead({
      utm_medium: l.utm_medium,
      source: l.source,
      campaignSourceType: campId ? campMap.get(campId) : null,
    });
    const metaForm = isMetaFormsLead(l.source);
    if (section === "organic") return !inorg;
    if (section === "inorganic") return inorg;
    if (section === "meta_forms") return metaForm;
    return true;
  });

  const stageKeys = [
    "total_leads",
    "r1_booked",
    "r1_completed",
    "r2_booked",
    "offered",
    "converts",
    "closed_lost",
  ];
  const monthSet = new Set<string>();
  for (const l of filtered) monthSet.add(String(l.created_at).slice(0, 7));
  const months = Array.from(monthSet).sort();

  const grid: Record<string, Record<string, number>> = {};
  for (const sk of stageKeys) grid[sk] = Object.fromEntries(months.map((m) => [m, 0]));

  for (const l of filtered) {
    const m = String(l.created_at).slice(0, 7);
    grid.total_leads[m] = (grid.total_leads[m] ?? 0) + 1;
    if (R1_BOOKED_STAGES.has(l.stage)) grid.r1_booked[m] = (grid.r1_booked[m] ?? 0) + 1;
    if (R1_DONE_STAGES.has(l.stage)) grid.r1_completed[m] = (grid.r1_completed[m] ?? 0) + 1;
    if (l.stage.startsWith("r2")) grid.r2_booked[m] = (grid.r2_booked[m] ?? 0) + 1;
    if (l.stage === "offered" || l.stage === "closed_won")
      grid.offered[m] = (grid.offered[m] ?? 0) + 1;
    if (l.stage === "closed_won") grid.converts[m] = (grid.converts[m] ?? 0) + 1;
    if (l.stage === "closed_lost") grid.closed_lost[m] = (grid.closed_lost[m] ?? 0) + 1;
  }

  const stages: PnlStageRow[] = stageKeys.map((sk) => ({
    stage: sk,
    months: grid[sk] ?? {},
    cohortTotal: Object.values(grid[sk] ?? {}).reduce((s, n) => s + n, 0),
  }));

  const totalLeads = stages.find((s) => s.stage === "total_leads")?.cohortTotal ?? 0;
  const converts = stages.find((s) => s.stage === "converts")?.cohortTotal ?? 0;

  return {
    stages,
    metrics: {
      tofuPct: tofuPct(converts, totalLeads) ?? 0,
      leadsToOffer:
        mofuPct(stages.find((s) => s.stage === "offered")?.cohortTotal ?? 0, totalLeads) ?? 0,
    },
  };
}

export type LeadWebsiteRow = {
  leadId: string;
  name: string;
  stage: string;
  timeOnSiteSec: number;
  sessions: number;
  pageviews: number;
  lastPage: string | null;
  converted: boolean;
  clarityUrl: string | null;
};

export async function fetchLeadWebsiteMetrics(
  filters: MarketingFilters
): Promise<LeadWebsiteRow[]> {
  const admin = db();
  const { data: leads } = await admin
    .from("leads")
    .select("id, name, stage, website_session_id, clarity_session_url")
    .not("website_session_id", "is", null)
    .gte("created_at", `${filters.fromDate}T00:00:00.000Z`)
    .lte("created_at", `${filters.toDate}T23:59:59.999Z`)
    .limit(200);

  const leadList = (leads ?? []).filter((l) => l.website_session_id);
  if (!leadList.length) return [];

  const sessionIds = leadList.map((l) => l.website_session_id as string);
  const events = await selectInChunks<{
    session_id: string;
    page_url: string | null;
    event_type: string;
    occurred_at: string;
  }>(
    "page_events",
    "session_id",
    sessionIds,
    "session_id, page_url, event_type, occurred_at"
  );

  const bySession = new Map<string, typeof events>();
  for (const e of events) {
    const arr = bySession.get(e.session_id) ?? [];
    arr.push(e);
    bySession.set(e.session_id, arr);
  }

  const rows: LeadWebsiteRow[] = [];
  for (const l of leadList) {
    const sid = l.website_session_id as string;
    const evs = (bySession.get(sid) ?? []).slice().sort((a, b) =>
      String(b.occurred_at).localeCompare(String(a.occurred_at))
    );
    const pageviews = evs.filter((e) => e.event_type === "pageview").length;
    const first = evs[evs.length - 1]?.occurred_at;
    const last = evs[0]?.occurred_at;
    let timeSec = 0;
    if (first && last) {
      timeSec = Math.max(
        0,
        Math.round((new Date(last).getTime() - new Date(first).getTime()) / 1000)
      );
    }
    rows.push({
      leadId: l.id,
      name: l.name,
      stage: l.stage,
      timeOnSiteSec: timeSec,
      sessions: 1,
      pageviews,
      lastPage: evs[0]?.page_url ?? null,
      converted: true,
      clarityUrl: l.clarity_session_url,
    });
  }
  return rows.sort((a, b) => b.timeOnSiteSec - a.timeOnSiteSec);
}

export type CallTrackerRow = {
  date: string;
  newLeads: number;
  day1Attempts: number;
  day2Attempts: number;
  day3Attempts: number;
  leadsCalledDay1: number;
  leadsWithAnyCall: number;
  r1Booked: number;
  day1CoveragePct: number | null;
  r1Pct: number | null;
};

function callDayOffset(leadCreatedIso: string, callLoggedIso: string): number {
  const leadDay = leadCreatedIso.slice(0, 10);
  const callDay = callLoggedIso.slice(0, 10);
  const t0 = new Date(`${leadDay}T00:00:00Z`).getTime();
  const t1 = new Date(`${callDay}T00:00:00Z`).getTime();
  return Math.round((t1 - t0) / 86_400_000);
}

/** Daily call tracker — Day 1/2/3 attempts vs new leads & R1 (Excel R-04). */
export async function fetchDailyCallTracker(
  filters: MarketingFilters
): Promise<CallTrackerRow[]> {
  const admin = db();
  const { data: leads } = await admin
    .from("leads")
    .select("id, created_at, stage")
    .gte("created_at", `${filters.fromDate}T00:00:00.000Z`)
    .lte("created_at", `${filters.toDate}T23:59:59.999Z`)
    .order("created_at", { ascending: true });

  if (!leads?.length) return [];

  const leadIds = leads.map((l) => l.id as string);
  const callRows = await selectInChunks<{ lead_id: string; logged_at: string }>(
    "call_logs",
    "lead_id",
    leadIds,
    "lead_id, logged_at"
  );

  const callsByLead = new Map<string, string[]>();
  for (const c of callRows) {
    const arr = callsByLead.get(c.lead_id) ?? [];
    arr.push(c.logged_at);
    callsByLead.set(c.lead_id, arr);
  }

  const byDate = new Map<string, CallTrackerRow>();

  for (const lead of leads) {
    const date = String(lead.created_at).slice(0, 10);
    const row =
      byDate.get(date) ??
      ({
        date,
        newLeads: 0,
        day1Attempts: 0,
        day2Attempts: 0,
        day3Attempts: 0,
        leadsCalledDay1: 0,
        leadsWithAnyCall: 0,
        r1Booked: 0,
        day1CoveragePct: null,
        r1Pct: null,
      } satisfies CallTrackerRow);
    row.newLeads += 1;
    if (R1_BOOKED_STAGES.has(lead.stage)) row.r1Booked += 1;

    const leadCalls = callsByLead.get(lead.id) ?? [];
    if (leadCalls.length) row.leadsWithAnyCall += 1;

    let hadDay1 = false;
    for (const loggedAt of leadCalls) {
      const offset = callDayOffset(String(lead.created_at), loggedAt);
      if (offset === 0) {
        row.day1Attempts += 1;
        hadDay1 = true;
      } else if (offset === 1) row.day2Attempts += 1;
      else if (offset === 2) row.day3Attempts += 1;
    }
    if (hadDay1) row.leadsCalledDay1 += 1;

    byDate.set(date, row);
  }

  return Array.from(byDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({
      ...row,
      day1CoveragePct: row.newLeads ? (row.leadsCalledDay1 / row.newLeads) * 100 : null,
      r1Pct: row.newLeads ? (row.r1Booked / row.newLeads) * 100 : null,
    }));
}

export { publishRate, formatInr, formatPct } from "@/lib/marketing/metrics";
