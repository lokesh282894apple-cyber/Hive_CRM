import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllPages } from "@/lib/supabase/paginate";
import {
  cachedMarketingQuery,
  MARKETING_CACHE_TAGS,
  marketingFilterCacheKey,
} from "@/lib/marketing/query-cache";
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
import { isClosedStage } from "@/lib/constants";

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
  "closed_paid",
]);

export type FunnelDayRow = {
  date: string;
  sessions: number;
  metaSpend: number;
  nonMetaSpend: number;
  /** Prefer marketing_daily_notes.organic_spend_inr when set */
  organicSpend: number;
  /** Prefer marketing_daily_notes.inorganic_spend_inr when set */
  inorganicSpend: number;
  totalSpend: number;
  leads: number;
  organicLeads: number;
  inorganicLeads: number;
  aqlOrganic: number;
  aqlInorganic: number;
  aqlTotal: number;
  r1Booked: number;
  r1BookedOrganic: number;
  r1BookedInorganic: number;
  r1Completed: number;
  sessionsToLeadsPct: number | null;
  r1ToLeadPct: number | null;
  r1ToLeadOrganicPct: number | null;
  r1ToLeadInorganicPct: number | null;
  blendedCpl: number | null;
  organicCpl: number | null;
  inorganicCpl: number | null;
  blendedCpaql: number | null;
  costPerR1: number | null;
  organicCostPerR1: number | null;
  inorganicCostPerR1: number | null;
  notes: string;
  /** Manual lines from marketing_daily_notes.activity_log */
  activityLog: string;
  /** Planning activations + parsed manual lines for the day */
  activityItems: {
    id: string;
    activity: string;
    owner: string | null;
    status: string | null;
    source: "activation" | "manual";
    attributedLeads?: number;
    channel?: string | null;
  }[];
  /** @deprecated use activityItems */
  doneActivations: { id: string; activity: string; owner: string | null }[];
};

export type MarketingDailyNote = {
  note_date: string;
  notes: string;
  organic_spend_inr: number | null;
  inorganic_spend_inr: number | null;
  activity_log?: string | null;
};

export async function fetchLeadFunnelUncached(
  filters: MarketingFilters
): Promise<FunnelDayRow[]> {
  const admin = db();
  const fromIso = `${filters.fromDate}T00:00:00.000Z`;
  const toIso = `${filters.toDate}T23:59:59.999Z`;

  const monthKeys = Array.from(
    new Set(
      (() => {
        const keys: string[] = [];
        const start = new Date(`${filters.fromDate}T00:00:00Z`);
        const end = new Date(`${filters.toDate}T00:00:00Z`);
        for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
          keys.push(d.toISOString().slice(0, 7));
        }
        return keys;
      })()
    )
  );

  const [sessions, leads, history, spendRows, costRows, campsRes, notesRes, activations] =
    await Promise.all([
      fetchAllPages<{ id: string; first_seen_at: string }>(
        (from, to) =>
          admin
            .from("visitor_sessions")
            .select("id, first_seen_at")
            .gte("first_seen_at", fromIso)
            .lte("first_seen_at", toIso)
            .order("first_seen_at", { ascending: true })
            .range(from, to),
        "visitor_sessions.funnel"
      ),
      fetchAllPages<{
        id: string;
        created_at: string;
        programme: string | null;
        cohort_id: string | null;
        source: string | null;
        utm_medium: string | null;
        aql_at: string | null;
        qualification_intent: string | null;
        financial_check: string | null;
        stage: string;
      }>(
        (from, to) =>
          admin
            .from("leads")
            .select(
              "id, created_at, programme, cohort_id, source, utm_medium, aql_at, qualification_intent, financial_check, stage"
            )
            .gte("created_at", fromIso)
            .lte("created_at", toIso)
            .order("created_at", { ascending: true })
            .range(from, to),
        "leads.funnel"
      ),
      fetchAllPages<{ lead_id: string; to_stage: string; changed_at: string }>(
        (from, to) =>
          admin
            .from("stage_history")
            .select("lead_id, to_stage, changed_at")
            .gte("changed_at", fromIso)
            .lte("changed_at", toIso)
            .order("changed_at", { ascending: true })
            .range(from, to),
        "stage_history.funnel"
      ),
      fetchAllPages<{ date: string; spend: number }>(
        (from, to) =>
          admin
            .from("ad_spend_daily")
            .select("date, spend")
            .gte("date", filters.fromDate)
            .lte("date", filters.toDate)
            .order("date", { ascending: true })
            .range(from, to),
        "ad_spend_daily.funnel"
      ),
      fetchAllPages<{ entry_date: string; amount_inr: number; is_organic: boolean }>(
        (from, to) =>
          admin
            .from("marketing_cost_entries")
            .select("entry_date, amount_inr, is_organic")
            .gte("entry_date", filters.fromDate)
            .lte("entry_date", filters.toDate)
            .order("entry_date", { ascending: true })
            .range(from, to),
        "marketing_cost_entries.funnel"
      ),
      admin.from("campaigns").select("id, source_type"),
      admin
        .from("marketing_daily_notes")
        .select("note_date, notes, organic_spend_inr, inorganic_spend_inr, activity_log")
        .gte("note_date", filters.fromDate)
        .lte("note_date", filters.toDate),
      monthKeys.length
        ? admin
            .from("marketing_activations")
            .select(
              "id, activity, owner, planned_date, actual_date, status, month_key, attributed_leads_count, channel"
            )
            .in("month_key", monthKeys)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ]);

  const leadIds = leads.map((l) => l.id);
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

  const notesByDate = new Map(
    (notesRes.data ?? []).map((n) => [
      String(n.note_date),
      n as MarketingDailyNote,
    ])
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
        organicSpend: 0,
        inorganicSpend: 0,
        totalSpend: 0,
        leads: 0,
        organicLeads: 0,
        inorganicLeads: 0,
        aqlOrganic: 0,
        aqlInorganic: 0,
        aqlTotal: 0,
        r1Booked: 0,
        r1BookedOrganic: 0,
        r1BookedInorganic: 0,
        r1Completed: 0,
        sessionsToLeadsPct: null,
        r1ToLeadPct: null,
        r1ToLeadOrganicPct: null,
        r1ToLeadInorganicPct: null,
        blendedCpl: null,
        organicCpl: null,
        inorganicCpl: null,
        blendedCpaql: null,
        costPerR1: null,
        organicCostPerR1: null,
        inorganicCostPerR1: null,
        notes: "",
        activityLog: "",
        activityItems: [],
        doneActivations: [],
      };
      dayMap.set(date, row);
    }
    return row;
  };

  const leadInorgById = new Map<string, boolean>();
  for (const l of leads) {
    const campId = attrMap.get(l.id);
    leadInorgById.set(
      l.id,
      isInorganicLead({
        utm_medium: l.utm_medium,
        source: l.source,
        campaignSourceType: campId ? campMap.get(campId) : null,
      })
    );
  }

  for (const s of sessions) {
    const d = String(s.first_seen_at).slice(0, 10);
    ensure(d).sessions += 1;
  }

  for (const sp of spendRows) {
    const d = String(sp.date);
    ensure(d).metaSpend += Number(sp.spend) || 0;
  }

  for (const c of costRows) {
    const d = String(c.entry_date);
    const amt = Number(c.amount_inr) || 0;
    if (c.is_organic) ensure(d).nonMetaSpend += amt;
    else ensure(d).metaSpend += amt;
  }

  for (const l of leads) {
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

  for (const l of leads) {
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

  const historyLeadIds = Array.from(new Set(history.map((h) => h.lead_id)));
  const missingHistoryIds = historyLeadIds.filter((id) => !leadInorgById.has(id));
  if (missingHistoryIds.length) {
    const missingLeads = await selectInChunks<{
      id: string;
      source: string | null;
      utm_medium: string | null;
    }>("leads", "id", missingHistoryIds, "id, source, utm_medium");
    const missingAttrs = await selectInChunks<{
      lead_id: string;
      first_touch_campaign_id: string | null;
    }>(
      "lead_attribution",
      "lead_id",
      missingHistoryIds,
      "lead_id, first_touch_campaign_id"
    );
    const missingAttrMap = new Map(
      missingAttrs.map((a) => [a.lead_id, a.first_touch_campaign_id])
    );
    for (const l of missingLeads) {
      const campId = missingAttrMap.get(l.id);
      leadInorgById.set(
        l.id,
        isInorganicLead({
          utm_medium: l.utm_medium,
          source: l.source,
          campaignSourceType: campId ? campMap.get(campId) : null,
        })
      );
    }
  }

  const r1BookedLeads = new Set<string>();
  const r1DoneLeads = new Set<string>();
  for (const h of history) {
    const d = String(h.changed_at).slice(0, 10);
    if (R1_BOOKED_STAGES.has(h.to_stage) && !r1BookedLeads.has(`${h.lead_id}:${d}`)) {
      r1BookedLeads.add(`${h.lead_id}:${d}`);
      const row = ensure(d);
      row.r1Booked += 1;
      if (leadInorgById.get(h.lead_id)) row.r1BookedInorganic += 1;
      else row.r1BookedOrganic += 1;
    }
    if (R1_DONE_STAGES.has(h.to_stage) && !r1DoneLeads.has(`${h.lead_id}:${d}`)) {
      r1DoneLeads.add(`${h.lead_id}:${d}`);
      ensure(d).r1Completed += 1;
    }
  }

  for (const a of activations.data ?? []) {
    const eventDate = a.actual_date
      ? String(a.actual_date).slice(0, 10)
      : a.planned_date
        ? String(a.planned_date).slice(0, 10)
        : null;
    if (!eventDate || !inRange(eventDate, filters.fromDate, filters.toDate)) continue;
    const item = {
      id: a.id as string,
      activity: a.activity as string,
      owner: (a.owner as string | null) ?? null,
      status: (a.status as string | null) ?? null,
      source: "activation" as const,
      attributedLeads: Number(a.attributed_leads_count) || 0,
      channel: (a.channel as string | null) ?? null,
    };
    const row = ensure(eventDate);
    row.activityItems.push(item);
    if (a.status === "done") {
      row.doneActivations.push({
        id: item.id,
        activity: item.activity,
        owner: item.owner,
      });
    }
  }

  for (const [date, note] of Array.from(notesByDate.entries())) {
    const row = ensure(date);
    row.notes = note.notes ?? "";
    row.activityLog = note.activity_log ?? "";
    const manualLines = String(note.activity_log ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    for (let i = 0; i < manualLines.length; i++) {
      row.activityItems.push({
        id: `manual:${date}:${i}`,
        activity: manualLines[i],
        owner: null,
        status: null,
        source: "manual",
      });
    }
  }

  const rows = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  for (const row of rows) {
    const note = notesByDate.get(row.date);
    row.organicSpend =
      note?.organic_spend_inr != null
        ? Number(note.organic_spend_inr) || 0
        : row.nonMetaSpend;
    row.inorganicSpend =
      note?.inorganic_spend_inr != null
        ? Number(note.inorganic_spend_inr) || 0
        : row.metaSpend;
    row.totalSpend = row.organicSpend + row.inorganicSpend;
    row.sessionsToLeadsPct = pct(row.leads, row.sessions);
    row.r1ToLeadPct = pct(row.r1Booked, row.leads);
    row.r1ToLeadOrganicPct = pct(row.r1BookedOrganic, row.organicLeads);
    row.r1ToLeadInorganicPct = pct(row.r1BookedInorganic, row.inorganicLeads);
    row.blendedCpl = blendedCpl(row.totalSpend, row.leads);
    row.organicCpl = blendedCpl(row.organicSpend, row.organicLeads);
    row.inorganicCpl = blendedCpl(row.inorganicSpend, row.inorganicLeads);
    row.blendedCpaql = cpaql(row.totalSpend, row.r1Booked);
    row.costPerR1 = costPerR1(row.totalSpend, row.r1Booked);
    row.organicCostPerR1 = costPerR1(row.organicSpend, row.r1BookedOrganic);
    row.inorganicCostPerR1 = costPerR1(row.inorganicSpend, row.r1BookedInorganic);
  }
  return rows;
}

/** Cached funnel — same numbers; request dedupe + 90s TTL (CRM dashboard pattern). */
export const fetchLeadFunnel = cachedMarketingQuery(
  {
    keyPrefix: "marketing-lead-funnel",
    tags: [MARKETING_CACHE_TAGS.funnel],
    serializeArgs: (filters: MarketingFilters) => marketingFilterCacheKey(filters),
  },
  fetchLeadFunnelUncached
);

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
    if (l.stage === "closed_paid") row.enrolled += 1;
  }

  const wonIds = leadList.filter((l) => l.stage === "closed_paid").map((l) => l.id as string);
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
    if (l.stage === "closed_paid") st.enrolled += 1;
    stats.set(cid, st);
  }

  const enrolledIds = leads.filter((l) => l.stage === "closed_paid").map((l) => l.id as string);
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
  organicSpend: number;
  inorganicSpend: number;
  totalSpend: number;
  salesCost: number;
  visitors: number;
  leads: number;
  organicLeads: number;
  inorganicLeads: number;
  aql: number;
  r1Booked: number;
  r1Completed: number;
  offers: number;
  converts: number;
  revenueBooked: number;
  revenueRealized: number;
  revenue: number;
  cpl: number | null;
  cpaql: number | null;
  costPerR1: number | null;
  liveCpa: number | null;
  liveCac: number | null;
  cac: number | null;
  roasVal: number | null;
  roms: number | null;
  /** Month cohort still open (not converted / lost / refund) */
  availableLeads: number;
};

export async function fetchMonthlyMarketingDataUncached(
  monthsBack = 12
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
    organicLeads: 0,
    inorganicLeads: 0,
    aql: 0,
    r1Booked: 0,
    r1Completed: 0,
    metaSpend: 0,
    nonMetaSpend: 0,
    organicSpend: 0,
    inorganicSpend: 0,
    offers: 0,
    converts: 0,
    revenueBooked: 0,
    revenueRealized: 0,
    availableLeads: 0,
  });
  const byMonth = new Map(monthKeys.map((k) => [k, emptyTotals()]));

  const [funnel, offeredLeads, wonLeads, fees, cohortLeads] = await Promise.all([
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
      .eq("stage", "closed_paid")
      .gte("updated_at", fromIso)
      .lte("updated_at", toIso),
    admin
      .from("fee_records")
      .select("total_fee, remaining_fee, revenue_amount, updated_at")
      .gte("updated_at", fromIso)
      .lte("updated_at", toIso),
    admin
      .from("leads")
      .select("created_at, stage")
      .gte("created_at", fromIso)
      .lte("created_at", toIso),
  ]);

  for (const r of funnel) {
    const mk = r.date.slice(0, 7);
    const t = byMonth.get(mk);
    if (!t) continue;
    t.sessions += r.sessions;
    t.leads += r.leads;
    t.organicLeads += r.organicLeads;
    t.inorganicLeads += r.inorganicLeads;
    t.aql += r.aqlTotal;
    t.r1Booked += r.r1Booked;
    t.r1Completed += r.r1Completed;
    t.metaSpend += r.metaSpend;
    t.nonMetaSpend += r.nonMetaSpend;
    t.organicSpend += r.organicSpend;
    t.inorganicSpend += r.inorganicSpend;
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
    const booked = Number(f.total_fee) || 0;
    const realized =
      f.revenue_amount != null
        ? Number(f.revenue_amount) || 0
        : booked - (Number(f.remaining_fee) || 0);
    t.revenueBooked += booked;
    t.revenueRealized += realized;
  }

  for (const l of cohortLeads.data ?? []) {
    const mk = String(l.created_at).slice(0, 7);
    const t = byMonth.get(mk);
    if (!t) continue;
    if (!isClosedStage(String(l.stage))) t.availableLeads += 1;
  }

  const salesCost = 60000;
  return monthKeys.map((monthKey) => {
    const totals = byMonth.get(monthKey) ?? emptyTotals();
    const totalSpend = totals.organicSpend + totals.inorganicSpend;
    const conv = totals.converts;
    const cac = liveCac(totalSpend, salesCost, conv);
    const romsVal = roas(totals.revenueRealized, totalSpend);
    return {
      monthKey,
      status: monthKey === currentMonth ? "live" : "closed",
      metaSpend: totals.metaSpend,
      nonMetaSpend: totals.nonMetaSpend,
      organicSpend: totals.organicSpend,
      inorganicSpend: totals.inorganicSpend,
      totalSpend,
      salesCost,
      visitors: totals.sessions,
      leads: totals.leads,
      organicLeads: totals.organicLeads,
      inorganicLeads: totals.inorganicLeads,
      aql: totals.aql,
      r1Booked: totals.r1Booked,
      r1Completed: totals.r1Completed,
      offers: totals.offers,
      converts: conv,
      revenueBooked: totals.revenueBooked,
      revenueRealized: totals.revenueRealized,
      revenue: totals.revenueRealized,
      cpl: blendedCpl(totalSpend, totals.leads),
      cpaql: cpaql(totalSpend, totals.r1Booked),
      costPerR1: costPerR1(totalSpend, totals.r1Booked),
      liveCpa: liveCpa(totalSpend, conv),
      liveCac: cac,
      cac,
      roasVal: romsVal,
      roms: romsVal,
      availableLeads: totals.availableLeads,
    };
  });
}

export const fetchMonthlyMarketingData = cachedMarketingQuery(
  {
    keyPrefix: "marketing-monthly",
    tags: [MARKETING_CACHE_TAGS.monthly, MARKETING_CACHE_TAGS.funnel],
    serializeArgs: (monthsBack = 12) => String(monthsBack),
  },
  fetchMonthlyMarketingDataUncached
);

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
    "closed_deferred",
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
    if (l.stage === "offered" || l.stage === "closed_paid")
      grid.offered[m] = (grid.offered[m] ?? 0) + 1;
    if (l.stage === "closed_paid") grid.converts[m] = (grid.converts[m] ?? 0) + 1;
    if (l.stage === "closed_deferred") grid.closed_deferred[m] = (grid.closed_deferred[m] ?? 0) + 1;
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

/** Fixed channel list for Module 6 channel dashboard. */
export const CHANNEL_DASHBOARD_KEYS = [
  "Meta",
  "Paid social",
  "Other organic",
  "Direct",
  "Google organic",
  "Google paid",
  "LinkedIn",
  "Instagram organic",
  "Unattributed",
  "Twitter",
  "YouTube organic",
  "YouTube paid",
] as const;

export type ChannelDashboardKey = (typeof CHANNEL_DASHBOARD_KEYS)[number];

export type ChannelFunnelRow = {
  channel: ChannelDashboardKey;
  sessions: number;
  sharePct: number | null;
  forms: number;
  leads: number;
  r1: number;
  r2: number;
  r3: number;
  offer: number;
  converts: number;
  convertPct: number | null;
  spend: number;
  cpl: number | null;
  costPerR1: number | null;
  costPerOffer: number | null;
  cac: number | null;
};

function classifyMarketingChannel(input: {
  utmSource: string | null;
  utmMedium: string | null;
  channelName: string | null;
  sourceType: string | null;
  leadSource: string | null;
}): ChannelDashboardKey {
  const src = (input.utmSource ?? "").toLowerCase();
  const med = (input.utmMedium ?? "").toLowerCase();
  const ch = (input.channelName ?? "").toLowerCase();
  const paid =
    input.sourceType === "paid_ad" ||
    /cpc|ppc|paid|paidsocial|display/.test(med);

  if (
    /meta|facebook|fb/.test(src) ||
    ch.includes("meta") ||
    ch.includes("facebook")
  ) {
    return "Meta";
  }
  if (
    /paidsocial|paid.?social|paid_social/.test(med) ||
    /paidsocial|paid.?social/.test(src) ||
    ch.includes("paid social")
  ) {
    return "Paid social";
  }
  if (/linkedin|li/.test(src) || ch.includes("linkedin")) return "LinkedIn";
  if (/instagram|ig/.test(src) || ch.includes("instagram")) {
    return paid ? "Paid social" : "Instagram organic";
  }
  if (/twitter|x\.com|^x$/.test(src) || ch.includes("twitter")) return "Twitter";
  if (/youtube|yt/.test(src) || ch.includes("youtube")) {
    return paid ? "YouTube paid" : "YouTube organic";
  }
  if (/google|adwords|googleads/.test(src) || ch.includes("google")) {
    return paid ? "Google paid" : "Google organic";
  }
  if (!src && !ch && !input.leadSource) return "Direct";
  if (/direct/.test(src) || ch === "direct") return "Direct";
  if (/organic|referral|other/.test(src) || ch.includes("other organic")) {
    return "Other organic";
  }
  if (!src && !med && !ch) return "Unattributed";
  return "Unattributed";
}

export async function fetchChannelFunnelUncached(
  filters: MarketingFilters
): Promise<ChannelFunnelRow[]> {
  const admin = db();
  const fromIso = `${filters.fromDate}T00:00:00.000Z`;
  const toIso = `${filters.toDate}T23:59:59.999Z`;

  const [sessions, leads, campsRes, spendRows, costRows] = await Promise.all([
    fetchAllPages<{
      id: string;
      utm_source: string | null;
      utm_medium: string | null;
      matched_campaign_id: string | null;
      first_seen_at: string;
    }>(
      (from, to) =>
        admin
          .from("visitor_sessions")
          .select("id, utm_source, utm_medium, matched_campaign_id, first_seen_at")
          .gte("first_seen_at", fromIso)
          .lte("first_seen_at", toIso)
          .order("first_seen_at", { ascending: true })
          .range(from, to),
      "visitor_sessions.channel"
    ),
    fetchAllPages<{
      id: string;
      stage: string;
      source: string | null;
      utm_source: string | null;
      utm_medium: string | null;
      created_at: string;
      programme?: string | null;
      cohort_id?: string | null;
    }>(
      (from, to) =>
        admin
          .from("leads")
          .select(
            "id, stage, source, utm_source, utm_medium, created_at, programme, cohort_id"
          )
          .gte("created_at", fromIso)
          .lte("created_at", toIso)
          .order("created_at", { ascending: true })
          .range(from, to),
      "leads.channel"
    ),
    admin.from("campaigns").select("id, source_type, channel_id, channels(name)"),
    fetchAllPages<{ campaign_id: string | null; spend: number; date: string }>(
      (from, to) =>
        admin
          .from("ad_spend_daily")
          .select("campaign_id, spend, date")
          .gte("date", filters.fromDate)
          .lte("date", filters.toDate)
          .order("date", { ascending: true })
          .range(from, to),
      "ad_spend_daily.channel"
    ),
    fetchAllPages<{
      entry_date: string;
      amount_inr: number;
      is_organic: boolean;
      channel: string | null;
    }>(
      (from, to) =>
        admin
          .from("marketing_cost_entries")
          .select("entry_date, amount_inr, is_organic, channel")
          .gte("entry_date", filters.fromDate)
          .lte("entry_date", filters.toDate)
          .order("entry_date", { ascending: true })
          .range(from, to),
      "marketing_cost_entries.channel"
    ),
  ]);

  const campMap = new Map(
    (campsRes.data ?? []).map((c) => {
      const ch = c.channels as { name?: string } | { name?: string }[] | null;
      const name = Array.isArray(ch) ? ch[0]?.name : ch?.name;
      return [
        c.id as string,
        { sourceType: c.source_type as string, channelName: name ?? null },
      ];
    })
  );

  const leadIds = leads.map((l) => l.id);
  const attrs = await selectInChunks<{
    lead_id: string;
    first_touch_campaign_id: string | null;
    session_id: string | null;
  }>(
    "lead_attribution",
    "lead_id",
    leadIds,
    "lead_id, first_touch_campaign_id, session_id"
  );
  const attrByLead = new Map(attrs.map((a) => [a.lead_id, a]));

  const empty = (): Omit<
    ChannelFunnelRow,
    "channel" | "convertPct" | "cpl" | "costPerR1" | "costPerOffer" | "cac" | "sharePct"
  > & {
    convertPct: null;
    cpl: null;
    costPerR1: null;
    costPerOffer: null;
    cac: null;
    sharePct: null;
  } => ({
    sessions: 0,
    sharePct: null,
    forms: 0,
    leads: 0,
    r1: 0,
    r2: 0,
    r3: 0,
    offer: 0,
    converts: 0,
    spend: 0,
    convertPct: null,
    cpl: null,
    costPerR1: null,
    costPerOffer: null,
    cac: null,
  });

  const byChannel = new Map<ChannelDashboardKey, ReturnType<typeof empty>>();
  for (const key of CHANNEL_DASHBOARD_KEYS) byChannel.set(key, empty());

  for (const s of sessions) {
    const camp = s.matched_campaign_id
      ? campMap.get(s.matched_campaign_id)
      : null;
    const key = classifyMarketingChannel({
      utmSource: s.utm_source,
      utmMedium: s.utm_medium,
      channelName: camp?.channelName ?? null,
      sourceType: camp?.sourceType ?? null,
      leadSource: null,
    });
    byChannel.get(key)!.sessions += 1;
  }

  for (const l of leads) {
    if (filters.programme && l.programme !== filters.programme) continue;
    if (filters.cohortId && l.cohort_id !== filters.cohortId) continue;
    const attr = attrByLead.get(l.id);
    const camp = attr?.first_touch_campaign_id
      ? campMap.get(attr.first_touch_campaign_id)
      : null;
    const key = classifyMarketingChannel({
      utmSource: l.utm_source,
      utmMedium: l.utm_medium,
      channelName: camp?.channelName ?? null,
      sourceType: camp?.sourceType ?? null,
      leadSource: l.source,
    });
    const row = byChannel.get(key)!;
    row.leads += 1;
    row.forms += 1;
    const stage = l.stage;
    if (R1_BOOKED_STAGES.has(stage) || R1_DONE_STAGES.has(stage) || stage.startsWith("r1"))
      row.r1 += 1;
    if (stage.startsWith("r2")) row.r2 += 1;
    if (stage.startsWith("r3")) row.r3 += 1;
    if (stage === "offered" || stage === "yet_to_offer" || stage === "closed_paid")
      row.offer += 1;
    if (stage === "closed_paid") row.converts += 1;
  }

  for (const s of spendRows) {
    if (!s.campaign_id) continue;
    const camp = campMap.get(s.campaign_id);
    const key = classifyMarketingChannel({
      utmSource: null,
      utmMedium: camp?.sourceType === "paid_ad" ? "cpc" : "organic",
      channelName: camp?.channelName ?? null,
      sourceType: camp?.sourceType ?? null,
      leadSource: null,
    });
    byChannel.get(key)!.spend += Number(s.spend) || 0;
  }

  for (const c of costRows) {
    const chLabel = String(c.channel ?? "").toLowerCase();
    let key: ChannelDashboardKey = c.is_organic ? "Other organic" : "Meta";
    if (chLabel.includes("google") && c.is_organic) key = "Google organic";
    else if (chLabel.includes("google")) key = "Google paid";
    else if (chLabel.includes("linkedin")) key = "LinkedIn";
    else if (chLabel.includes("instagram")) key = "Instagram organic";
    else if (chLabel.includes("youtube") && c.is_organic) key = "YouTube organic";
    else if (chLabel.includes("youtube")) key = "YouTube paid";
    else if (chLabel.includes("twitter")) key = "Twitter";
    else if (chLabel.includes("meta") || chLabel.includes("facebook")) key = "Meta";
    else if (chLabel.includes("paid social") || chLabel.includes("paidsocial"))
      key = "Paid social";
    else if (chLabel.includes("direct")) key = "Direct";
    byChannel.get(key)!.spend += Number(c.amount_inr) || 0;
  }

  const totalSessions = Array.from(byChannel.values()).reduce(
    (s, r) => s + r.sessions,
    0
  );

  return CHANNEL_DASHBOARD_KEYS.map((channel) => {
    const row = byChannel.get(channel)!;
    return {
      channel,
      sessions: row.sessions,
      sharePct: pct(row.sessions, totalSessions),
      forms: row.forms,
      leads: row.leads,
      r1: row.r1,
      r2: row.r2,
      r3: row.r3,
      offer: row.offer,
      converts: row.converts,
      convertPct: pct(row.converts, row.leads),
      spend: row.spend,
      cpl: blendedCpl(row.spend, row.leads),
      costPerR1: costPerR1(row.spend, row.r1),
      costPerOffer: safeDiv(row.spend, row.offer),
      cac: blendedCpl(row.spend, row.converts),
    };
  });
}

export const fetchChannelFunnel = cachedMarketingQuery(
  {
    keyPrefix: "marketing-channel-funnel",
    tags: [MARKETING_CACHE_TAGS.channel],
    serializeArgs: (filters: MarketingFilters) => marketingFilterCacheKey(filters),
  },
  fetchChannelFunnelUncached
);

function safeDiv(num: number, den: number): number | null {
  if (!den || !Number.isFinite(den)) return null;
  return num / den;
}

export type MonthPnlSlice = {
  monthKey: string;
  section: PnlSection;
  sessions: number;
  leads: number;
  r1Booked: number;
  r1Completed: number;
  offers: number;
  converts: number;
  organicSpend: number;
  inorganicSpend: number;
  totalSpend: number;
  revenueBooked: number;
  revenueRealized: number;
  cpl: number | null;
  costPerR1: number | null;
  cac: number | null;
  roms: number | null;
};

export async function fetchMonthPnlUncached(
  monthKey: string,
  section: PnlSection = "total",
  extra: { cohortId?: string | null; programme?: string | null } = {}
): Promise<MonthPnlSlice> {
  const fromDate = `${monthKey}-01`;
  const y = Number(monthKey.slice(0, 4));
  const m = Number(monthKey.slice(5, 7));
  const lastDay = new Date(y, m, 0).getDate();
  const toDate = `${monthKey}-${String(lastDay).padStart(2, "0")}`;
  const fromIso = `${fromDate}T00:00:00.000Z`;
  const toIso = `${toDate}T23:59:59.999Z`;
  const filters: MarketingFilters = {
    fromDate,
    toDate,
    cohortId: extra.cohortId,
    programme: extra.programme,
  };

  const admin = db();

  type MetaLeadRow = {
    id: string;
    source: string | null;
    stage: string;
    created_at: string;
    cohort_id?: string | null;
    programme?: string | null;
  };

  /** Month-scoped extras only — avoids re-running 24 months of funnel (CRM LDV pattern). */
  const monthExtrasP = Promise.all([
    admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("stage", "offered")
      .gte("updated_at", fromIso)
      .lte("updated_at", toIso),
    admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("stage", "closed_paid")
      .gte("updated_at", fromIso)
      .lte("updated_at", toIso),
    fetchAllPages<{
      total_fee: number | null;
      remaining_fee: number | null;
      revenue_amount: number | null;
    }>(
      (from, to) =>
        admin
          .from("fee_records")
          .select("total_fee, remaining_fee, revenue_amount")
          .gte("updated_at", fromIso)
          .lte("updated_at", toIso)
          .order("updated_at", { ascending: true })
          .range(from, to),
      "fee_records.monthPnl"
    ),
  ]);

  const metaLeadsP =
    section === "meta_forms"
      ? fetchAllPages<MetaLeadRow>(
          (from, to) => {
            let q = admin
              .from("leads")
              .select("id, source, stage, created_at, cohort_id, programme")
              .gte("created_at", fromIso)
              .lte("created_at", toIso)
              .order("created_at", { ascending: true })
              .range(from, to);
            if (extra.cohortId) q = q.eq("cohort_id", extra.cohortId);
            if (extra.programme) q = q.eq("programme", extra.programme);
            return q;
          },
          "leads.monthPnl.meta"
        )
      : Promise.resolve([] as MetaLeadRow[]);

  const [funnel, monthExtras, metaLeads] = await Promise.all([
    fetchLeadFunnel(filters),
    monthExtrasP,
    metaLeadsP,
  ]);

  const [offeredRes, wonRes, feeRows] = monthExtras;
  let revenueBooked = 0;
  let revenueRealized = 0;
  for (const f of feeRows) {
    const booked = Number(f.total_fee) || 0;
    const realized =
      f.revenue_amount != null
        ? Number(f.revenue_amount) || 0
        : booked - (Number(f.remaining_fee) || 0);
    revenueBooked += booked;
    revenueRealized += realized;
  }
  const offers =
    section === "meta_forms"
      ? metaLeads.filter(
          (l) =>
            isMetaFormsLead(l.source) &&
            (l.stage === "offered" ||
              l.stage === "yet_to_offer" ||
              l.stage === "closed_paid")
        ).length
      : offeredRes.count ?? 0;
  const converts =
    section === "meta_forms"
      ? metaLeads.filter(
          (l) => isMetaFormsLead(l.source) && l.stage === "closed_paid"
        ).length
      : wonRes.count ?? 0;

  let organicSpend = 0;
  let inorganicSpend = 0;
  let sessions = 0;
  let leads = 0;
  let r1Booked = 0;
  let r1Completed = 0;

  if (section === "meta_forms") {
    const meta = metaLeads.filter((l) => isMetaFormsLead(l.source));
    leads = meta.length;
    r1Booked = meta.filter(
      (l) =>
        R1_BOOKED_STAGES.has(l.stage) ||
        R1_DONE_STAGES.has(l.stage) ||
        String(l.stage).startsWith("r1")
    ).length;
    r1Completed = meta.filter((l) => R1_DONE_STAGES.has(l.stage)).length;
    for (const r of funnel) {
      sessions += r.sessions;
      inorganicSpend += r.inorganicSpend;
    }
    revenueBooked = 0;
    revenueRealized = 0;
  } else {
    for (const r of funnel) {
      sessions += r.sessions;
      if (section === "organic") {
        leads += r.organicLeads;
        organicSpend += r.organicSpend;
        r1Booked += r.r1BookedOrganic;
      } else if (section === "inorganic") {
        leads += r.inorganicLeads;
        inorganicSpend += r.inorganicSpend;
        r1Booked += r.r1BookedInorganic;
      } else {
        leads += r.leads;
        organicSpend += r.organicSpend;
        inorganicSpend += r.inorganicSpend;
        r1Booked += r.r1Booked;
      }
      r1Completed += r.r1Completed;
    }
  }

  const totalSpend =
    section === "organic"
      ? organicSpend
      : section === "inorganic" || section === "meta_forms"
        ? inorganicSpend
        : organicSpend + inorganicSpend;

  return {
    monthKey,
    section,
    sessions,
    leads,
    r1Booked,
    r1Completed,
    offers,
    converts,
    organicSpend,
    inorganicSpend,
    totalSpend,
    revenueBooked,
    revenueRealized,
    cpl: blendedCpl(totalSpend, leads),
    costPerR1: costPerR1(totalSpend, r1Booked),
    cac: liveCac(totalSpend, 60000, converts),
    roms: roas(revenueRealized, totalSpend),
  };
}

export const fetchMonthPnl = cachedMarketingQuery(
  {
    keyPrefix: "marketing-month-pnl",
    tags: [MARKETING_CACHE_TAGS.monthly, MARKETING_CACHE_TAGS.funnel],
    serializeArgs: (
      monthKey: string,
      section: PnlSection = "total",
      extra: { cohortId?: string | null; programme?: string | null } = {}
    ) =>
      [monthKey, section, extra.cohortId ?? "", extra.programme ?? ""].join("|"),
  },
  fetchMonthPnlUncached
);
