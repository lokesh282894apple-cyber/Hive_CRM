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
import { istDateKey, istEndIso, istMonthKey, istStartIso } from "@/lib/tz";
import { bookedRevenueByConvertMonth, realisedRevenueByMonth } from "@/lib/analytics/revenue-events";
import {
  bucketFunnel,
  emptyFunnelCounts,
  loadFunnelLeads,
  loadFunnelLeadsById,
  PAST_STUDENT_SOURCE,
  type FunnelBasis,
  type FunnelCounts,
} from "@/lib/analytics/funnel-engine";

function db(): SupabaseClient {
  return createAdminClient();
}

/** PostgREST `.in()` URL length + row caps — chunk ids and fetch in parallel batches. */
const IN_CHUNK = 150;
const IN_CONCURRENCY = 20;

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
  /** Funnel counts by event date (default) or by lead created date (cohort) */
  basis?: FunnelBasis;
};

export function parseMarketingFilters(sp: Record<string, string | undefined>): MarketingFilters {
  const today = new Date();
  const to = sp.to ?? istDateKey(today);
  const fromDefault = new Date(today);
  fromDefault.setDate(fromDefault.getDate() - 30);
  const from = sp.from ?? istDateKey(fromDefault);
  return {
    fromDate: from,
    toDate: to,
    programme: sp.programme || null,
    cohortId: sp.cohort || null,
    channel: sp.channel || null,
    organicOnly: sp.organic === "1",
    inorganicOnly: sp.inorganic === "1",
    basis: sp.basis === "cohort" ? "cohort" : "event",
  };
}



function inRange(iso: string, from: string, to: string): boolean {
  const d = istDateKey(iso);
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
  /** null when the paid/organic split function is not installed */
  sessionsPaid: number | null;
  sessionsOrganic: number | null;
  /** Every milestone, split organic / inorganic — from the shared funnel engine */
  funnel: FunnelCounts;
  metaSpend: number;
  nonMetaSpend: number;
  /** Manual spend overrides typed for the day (null = none) — editors save these back */
  noteOrganicSpend: number | null;
  noteInorganicSpend: number | null;
  /** Always 0 — every paid rupee is inorganic (team rule) */
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

type RpcErr = { message: string; code?: string } | null;

function isMissingRpc(err: RpcErr): boolean {
  if (!err) return false;
  return (
    err.code === "PGRST202" ||
    err.code === "42883" ||
    /could not find the function/i.test(err.message)
  );
}

/**
 * Sessions per IST day in [fromIso, toIso]. Uses rpc_sessions_per_day_ist (counts
 * in Postgres); falls back to paging rows if the migration isn't applied.
 */
export async function sessionsPerDay(
  admin: SupabaseClient,
  fromIso: string,
  toIso: string,
  /** "rows" forces the old row-paging path (parity checks only). */
  mode: "auto" | "rows" = "auto"
): Promise<{ day: string; sessions: number }[]> {
  const { data, error } =
    mode === "rows"
      ? { data: null, error: { message: "could not find the function (forced)" } }
      : await admin.rpc("rpc_sessions_per_day_ist", { p_from: fromIso, p_to: toIso });
  if (!error) {
    return ((data ?? []) as { day: string; sessions: number | string }[]).map((r) => ({
      day: r.day,
      sessions: Number(r.sessions) || 0,
    }));
  }
  if (!isMissingRpc(error)) throw new Error(`rpc_sessions_per_day_ist: ${error.message}`);
  const rows = await fetchAllPages<{ id: string; first_seen_at: string }>(
    (from, to) =>
      admin
        .from("visitor_sessions")
        .select("id, first_seen_at")
        .gte("first_seen_at", fromIso)
        .lte("first_seen_at", toIso)
        .order("first_seen_at", { ascending: true })
        .order("id", { ascending: true }).range(from, to),
    "visitor_sessions.funnel"
  );
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const d = istDateKey(r.first_seen_at);
    byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }
  return Array.from(byDay, ([day, sessions]) => ({ day, sessions }));
}

type SessionSourceGroup = {
  utm_source: string | null;
  utm_medium: string | null;
  matched_campaign_id: string | null;
  sessions: number;
};

/** Sessions grouped by (utm_source, utm_medium, campaign) in [fromIso, toIso]. */
export async function sessionsBySource(
  admin: SupabaseClient,
  fromIso: string,
  toIso: string,
  /** "rows" forces the old row-paging path (parity checks only). */
  mode: "auto" | "rows" = "auto"
): Promise<SessionSourceGroup[]> {
  // v2 returns ONE jsonb value. The v1 set-returning function was capped at
  // PostgREST Max rows (20k groups) and silently dropped the rest.
  const { data, error } =
    mode === "rows"
      ? { data: null, error: { message: "could not find the function (forced)" } }
      : await admin.rpc("rpc_sessions_by_source_v2", { p_from: fromIso, p_to: toIso });
  if (!error) {
    return ((data ?? []) as (Omit<SessionSourceGroup, "sessions"> & {
      sessions: number | string;
    })[]).map((r) => ({ ...r, sessions: Number(r.sessions) || 0 }));
  }
  // Missing v2 → uncapped row path (never fall back to the capped v1)
  if (!isMissingRpc(error)) throw new Error(`rpc_sessions_by_source_v2: ${error.message}`);
  const rows = await fetchAllPages<{
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
        .order("id", { ascending: true }).range(from, to),
    "visitor_sessions.channel"
  );
  const groups = new Map<string, SessionSourceGroup>();
  for (const r of rows) {
    const k = JSON.stringify([r.utm_source, r.utm_medium, r.matched_campaign_id]);
    const g = groups.get(k) ?? {
      utm_source: r.utm_source,
      utm_medium: r.utm_medium,
      matched_campaign_id: r.matched_campaign_id,
      sessions: 0,
    };
    g.sessions += 1;
    groups.set(k, g);
  }
  return Array.from(groups.values());
}

/**
 * Sessions per IST day split Paid / Organic (same rule as leads). Returns null
 * when the function isn't installed yet — the page shows "—", not a guess.
 */
export async function sessionsPaidSplit(
  admin: SupabaseClient,
  fromIso: string,
  toIso: string
): Promise<{ day: string; paid: number; organic: number }[] | null> {
  const { data, error } = await admin.rpc("rpc_sessions_paid_split_ist", { p_from: fromIso, p_to: toIso });
  if (error) {
    if (isMissingRpc(error)) return null;
    throw new Error(`rpc_sessions_paid_split_ist: ${error.message}`);
  }
  return ((data ?? []) as { day: string; paid: number | string; organic: number | string }[]).map((r) => ({
    day: r.day,
    paid: Number(r.paid) || 0,
    organic: Number(r.organic) || 0,
  }));
}

export async function fetchLeadFunnelUncached(
  filters: MarketingFilters
): Promise<FunnelDayRow[]> {
  const admin = db();
  const fromIso = istStartIso(filters.fromDate);
  const toIso = istEndIso(filters.toDate);

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

  const [sessions, leads, funnelLeads, spendRows, costRows, split, notesRes, activations] =
    await Promise.all([
      sessionsPerDay(admin, fromIso, toIso),
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
            .order("id", { ascending: true }).range(from, to),
        "leads.funnel"
      ),
      loadFunnelLeads(admin, fromIso, toIso),
      fetchAllPages<{ date: string; spend: number }>(
        (from, to) =>
          admin
            .from("ad_spend_daily")
            .select("date, spend")
            .gte("date", filters.fromDate)
            .lte("date", filters.toDate)
            .order("date", { ascending: true })
            .order("id", { ascending: true }).range(from, to),
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
            .order("id", { ascending: true }).range(from, to),
        "marketing_cost_entries.funnel"
      ),
      sessionsPaidSplit(admin, fromIso, toIso),
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

  // Paid / organic per lead comes from the funnel engine (it already joined
  // attribution) — no second round of attribution lookups
  const inorganicById = new Map(funnelLeads.map((l) => [l.id, l.inorganic]));

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
        sessionsPaid: null,
        sessionsOrganic: null,
        funnel: emptyFunnelCounts(),
        noteOrganicSpend: null,
        noteInorganicSpend: null,
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

  for (const s of sessions) {
    ensure(s.day).sessions += s.sessions;
  }
  if (split) {
    for (const r of Array.from(dayMap.values())) {
      r.sessionsPaid = 0;
      r.sessionsOrganic = 0;
    }
    for (const sp of split) {
      const row = ensure(sp.day);
      row.sessionsPaid = (row.sessionsPaid ?? 0) + sp.paid;
      row.sessionsOrganic = (row.sessionsOrganic ?? 0) + sp.organic;
    }
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

  // Leads + every funnel milestone from the shared engine (one source of truth)
  const scopedFunnelLeads = funnelLeads.filter(
    (l) =>
      (!filters.programme || l.programme === filters.programme) &&
      (!filters.cohortId || l.cohortId === filters.cohortId) &&
      (!filters.organicOnly || !l.inorganic) &&
      (!filters.inorganicOnly || l.inorganic)
  );
  const byDay = bucketFunnel(scopedFunnelLeads, filters.basis ?? "event", (iso) => {
    const d = istDateKey(iso);
    return d >= filters.fromDate && d <= filters.toDate ? d : null;
  });
  for (const [d, counts] of Array.from(byDay.entries())) {
    const row = ensure(d);
    row.funnel = counts;
    row.leads = counts.leads.total;
    row.organicLeads = counts.leads.org;
    row.inorganicLeads = counts.leads.inorg;
    row.r1Booked = counts.r1Booked.total;
    row.r1BookedOrganic = counts.r1Booked.org;
    row.r1BookedInorganic = counts.r1Booked.inorg;
    row.r1Completed = counts.r1Completed.total;
  }

  for (const l of leads) {
    if (l.source === PAST_STUDENT_SOURCE) continue;
    const aqlDate = l.aql_at
      ? istDateKey(l.aql_at)
      : meetsAqlCriteria(l)
        ? istDateKey(l.created_at)
        : null;
    if (!aqlDate || !inRange(aqlDate, filters.fromDate, filters.toDate)) continue;
    const inorg =
      inorganicById.get(l.id) ?? isInorganicLead({ utm_medium: l.utm_medium, source: l.source });
    const row = ensure(aqlDate);
    row.aqlTotal += 1;
    if (inorg) row.aqlInorganic += 1;
    else row.aqlOrganic += 1;
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
    // Total = the day's overrides when entered, else Meta + every cost entry
    const enteredOrganic =
      note?.organic_spend_inr != null ? Number(note.organic_spend_inr) || 0 : row.nonMetaSpend;
    const enteredInorganic =
      note?.inorganic_spend_inr != null ? Number(note.inorganic_spend_inr) || 0 : row.metaSpend;
    row.totalSpend = enteredOrganic + enteredInorganic;
    // Team rule: anything paid for is inorganic; organic = reach that cost
    // nothing. Every rupee spent is therefore inorganic and organic spend is 0
    // (the "organic" tick on a cost entry no longer moves money to organic).
    row.inorganicSpend = row.totalSpend;
    row.organicSpend = 0;
    row.noteOrganicSpend = note?.organic_spend_inr != null ? Number(note.organic_spend_inr) || 0 : null;
    row.noteInorganicSpend = note?.inorganic_spend_inr != null ? Number(note.inorganic_spend_inr) || 0 : null;
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
    keyPrefix: "marketing-lead-funnel-v3-paid",
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
  // All leads in range — DQ reason counts/percentages are computed from these
  // (a 500-row cap undercounted busy months).
  type QualRaw = {
    id: string;
    name: string;
    created_at: string;
    stage: string;
    programme: string | null;
    qualification_intent: string | null;
    financial_check: string | null;
    source: string | null;
    meta_campaign_name: string | null;
    meta_ad_set: string | null;
    meta_ad_name: string | null;
    dq_reason: string | null;
    lead_allocated_to: string | null;
    aql_at: string | null;
    utm_campaign: string | null;
  };
  const data = await fetchAllPages<QualRaw>(
    (from, to) =>
      admin
        .from("leads")
        .select(
          "id, name, created_at, programme, qualification_intent, financial_check, source, meta_campaign_name, meta_ad_set, meta_ad_name, stage, dq_reason, lead_allocated_to, aql_at, utm_campaign"
        )
        .gte("created_at", istStartIso(filters.fromDate))
        .lte("created_at", istEndIso(filters.toDate))
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to),
    "leads.qualification"
  );

  return (data ?? [])
    .filter((l) => !filters.programme || l.programme === filters.programme)
    .map((l) => ({
      id: l.id,
      name: l.name,
      leadDate: istDateKey(l.created_at),
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
    .gte("created_at", istStartIso(filters.fromDate))
    .lte("created_at", istEndIso(filters.toDate));

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
  const reachedById = new Map((await loadFunnelLeadsById(admin, leadIds)).map((f) => [f.id, f.at]));
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
    const at = reachedById.get(l.id) ?? {};
    if (at.r1Booked) row.r1 += 1;
    if (at.convert) row.enrolled += 1;
  }

  const wonIds = leadList.filter((l) => reachedById.get(l.id)?.convert).map((l) => l.id as string);
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
      .gte("created_at", istStartIso(filters.fromDate))
      .lte("created_at", istEndIso(filters.toDate)),
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

  const reachedById = new Map((await loadFunnelLeadsById(admin, leadIds)).map((f) => [f.id, f.at]));
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
    const at = reachedById.get(a.lead_id) ?? {};
    if (at.r1Booked) st.r1 += 1;
    if (at.convert) st.enrolled += 1;
    stats.set(cid, st);
  }

  const enrolledIds = leads.filter((l) => reachedById.get(l.id as string)?.convert).map((l) => l.id as string);
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
    // API rows in this table were overwritten day-by-day by the old sync — the
    // API now writes meta_ad_insights_daily; only CSV/manual uploads are kept here
    .neq("source", "api")
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

export type MetaAdGroupBy = "ad" | "adset" | "campaign";

export type MetaAdPerfRow = {
  key: string;
  campaignName: string;
  adSetName: string | null;
  adName: string | null;
  days: number;
  spend: number;
  impressions: number;
  reach: number;
  linkClicks: number;
  metaLeads: number;
  /** CRM leads created in range whose ad / campaign tag matches this row */
  crmLeads: number;
  costPerLead: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  /** 3-second video plays ÷ impressions; null for non-video ads */
  hookRate: number | null;
  /** ThruPlays ÷ 3-second plays */
  holdRate: number | null;
};

export type MetaAdPerformance = {
  rows: MetaAdPerfRow[];
  totals: Omit<MetaAdPerfRow, "key" | "campaignName" | "adSetName" | "adName" | "days">;
  lastSyncedAt: string | null;
  /** meta_ad_insights_daily migration not applied yet */
  setupNeeded: boolean;
};

type MetaDailyRow = {
  ad_id: string;
  date: string;
  campaign_name: string;
  adset_name: string | null;
  ad_name: string;
  spend: number | string;
  impressions: number | string;
  reach: number | string;
  link_clicks: number;
  meta_leads: number;
  video_plays_3s: number;
  thru_plays: number;
  synced_at: string;
};

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/**
 * Meta dashboard from meta_ad_insights_daily — days in the range summed per
 * ad / ad set / campaign. CRM leads are matched on the ad id or name stored on
 * the lead (Meta lead forms store the ad id; website forms carry utm_content),
 * and at campaign level on meta_campaign_name / utm_campaign.
 */
export async function fetchMetaAdPerformance(
  filters: MarketingFilters,
  groupBy: MetaAdGroupBy
): Promise<MetaAdPerformance> {
  const admin = db();
  let setupNeeded = false;
  const [daily, leads] = await Promise.all([
    fetchAllPages<MetaDailyRow>(
      (from, to) =>
        admin
          .from("meta_ad_insights_daily")
          .select(
            "ad_id, date, campaign_name, adset_name, ad_name, spend, impressions, reach, link_clicks, meta_leads, video_plays_3s, thru_plays, synced_at"
          )
          .gte("date", filters.fromDate)
          .lte("date", filters.toDate)
          .order("date", { ascending: true })
          .order("ad_id", { ascending: true })
          .range(from, to),
      "meta_ad_insights_daily"
    ).catch((e: Error) => {
      // Table arrives with migration 20261002100000 — show setup note, not a crash
      if (/meta_ad_insights_daily|does not exist|schema cache/i.test(e.message)) {
        setupNeeded = true;
        return [] as MetaDailyRow[];
      }
      throw e;
    }),
    fetchAllPages<{
      id: string;
      meta_ad_name: string | null;
      utm_content: string | null;
      meta_campaign_name: string | null;
      utm_campaign: string | null;
    }>(
      (from, to) =>
        admin
          .from("leads")
          .select("id, meta_ad_name, utm_content, meta_campaign_name, utm_campaign")
          .gte("created_at", istStartIso(filters.fromDate))
          .lte("created_at", istEndIso(filters.toDate))
          .order("id", { ascending: true })
          .range(from, to),
      "leads.metaMatch"
    ),
  ]);

  const leadsByAdTag = new Map<string, number>();
  const leadsByCampaign = new Map<string, number>();
  for (const l of leads) {
    const tags = new Set([norm(l.meta_ad_name), norm(l.utm_content)].filter(Boolean));
    for (const t of Array.from(tags)) leadsByAdTag.set(t, (leadsByAdTag.get(t) ?? 0) + 1);
    const camps = new Set([norm(l.meta_campaign_name), norm(l.utm_campaign)].filter(Boolean));
    for (const c of Array.from(camps)) leadsByCampaign.set(c, (leadsByCampaign.get(c) ?? 0) + 1);
  }

  type Acc = {
    campaignName: string;
    adSetName: string | null;
    adName: string | null;
    adIds: Set<string>;
    adNames: Set<string>;
    days: Set<string>;
    spend: number;
    impressions: number;
    reach: number;
    linkClicks: number;
    metaLeads: number;
    v3: number;
    thru: number;
  };
  const groups = new Map<string, Acc>();
  let lastSyncedAt: string | null = null;
  for (const r of daily) {
    if (!lastSyncedAt || r.synced_at > lastSyncedAt) lastSyncedAt = r.synced_at;
    const key =
      groupBy === "ad"
        ? r.ad_id
        : groupBy === "adset"
          ? `${r.campaign_name}\u0000${r.adset_name ?? ""}`
          : r.campaign_name;
    let g = groups.get(key);
    if (!g) {
      g = {
        campaignName: r.campaign_name,
        adSetName: groupBy === "campaign" ? null : r.adset_name,
        adName: groupBy === "ad" ? r.ad_name : null,
        adIds: new Set(),
        adNames: new Set(),
        days: new Set(),
        spend: 0,
        impressions: 0,
        reach: 0,
        linkClicks: 0,
        metaLeads: 0,
        v3: 0,
        thru: 0,
      };
      groups.set(key, g);
    }
    g.adIds.add(norm(r.ad_id));
    g.adNames.add(norm(r.ad_name));
    g.days.add(r.date);
    g.spend += Number(r.spend) || 0;
    g.impressions += Number(r.impressions) || 0;
    // Reach is not additive across days — the sum is an upper bound
    g.reach += Number(r.reach) || 0;
    g.linkClicks += r.link_clicks || 0;
    g.metaLeads += r.meta_leads || 0;
    g.v3 += r.video_plays_3s || 0;
    g.thru += r.thru_plays || 0;
  }

  const finish = (
    a: Pick<Acc, "spend" | "impressions" | "reach" | "linkClicks" | "metaLeads" | "v3" | "thru">,
    crmLeads: number
  ) => ({
    spend: a.spend,
    impressions: a.impressions,
    reach: a.reach,
    linkClicks: a.linkClicks,
    metaLeads: a.metaLeads,
    crmLeads,
    costPerLead: crmLeads ? a.spend / crmLeads : null,
    ctr: ctr(a.linkClicks, a.impressions),
    cpc: cpc(a.spend, a.linkClicks),
    cpm: cpm(a.spend, a.impressions),
    hookRate: a.v3 > 0 ? hookRate(a.v3, a.impressions) : null,
    holdRate: a.v3 > 0 ? (a.thru / a.v3) * 100 : null,
  });

  const rows: MetaAdPerfRow[] = [];
  const tot = { spend: 0, impressions: 0, reach: 0, linkClicks: 0, metaLeads: 0, v3: 0, thru: 0 };
  for (const [key, g] of Array.from(groups.entries())) {
    let crm = 0;
    if (groupBy === "campaign") {
      crm = leadsByCampaign.get(norm(g.campaignName)) ?? 0;
    } else {
      const tags = new Set([...Array.from(g.adIds), ...Array.from(g.adNames)]);
      for (const t of Array.from(tags)) crm += leadsByAdTag.get(t) ?? 0;
    }
    rows.push({
      key,
      campaignName: g.campaignName,
      adSetName: g.adSetName,
      adName: g.adName,
      days: g.days.size,
      ...finish(g, crm),
    });
    tot.spend += g.spend;
    tot.impressions += g.impressions;
    tot.reach += g.reach;
    tot.linkClicks += g.linkClicks;
    tot.metaLeads += g.metaLeads;
    tot.v3 += g.v3;
    tot.thru += g.thru;
  }
  rows.sort((a, b) => b.spend - a.spend);
  const crmTotal = rows.reduce((n, r) => n + r.crmLeads, 0);

  return { rows, totals: finish(tot, crmTotal), lastSyncedAt, setupNeeded };
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
  const toDate = istDateKey(now);
  const fromIso = istStartIso(fromDate);
  const toIso = istEndIso(toDate);

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

  // Offers / converts / revenue dated by when they happened (shared engine +
  // revenue-events) — they used to follow the lead's / fee's last edit
  const [funnel, booked, realised, cohortLeads] = await Promise.all([
    fetchLeadFunnel({ fromDate, toDate }),
    bookedRevenueByConvertMonth(admin, fromIso, toIso),
    realisedRevenueByMonth(admin, fromDate, toDate),
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
    t.offers += r.funnel.offer.total;
    t.converts += r.funnel.convert.total;
  }
  for (const [mk, b] of Array.from(booked.entries())) {
    const t = byMonth.get(mk);
    if (t) t.revenueBooked += b.exGst;
  }
  for (const [mk, amt] of Array.from(realised.entries())) {
    const t = byMonth.get(mk);
    if (t) t.revenueRealized += amt;
  }

  for (const l of cohortLeads.data ?? []) {
    const mk = istMonthKey(l.created_at);
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
    keyPrefix: "marketing-monthly-v2-events",
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
  for (const l of filtered) monthSet.add(istMonthKey(l.created_at));
  const months = Array.from(monthSet).sort();

  const grid: Record<string, Record<string, number>> = {};
  for (const sk of stageKeys) grid[sk] = Object.fromEntries(months.map((m) => [m, 0]));

  for (const l of filtered) {
    const m = istMonthKey(l.created_at);
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
    .gte("created_at", istStartIso(filters.fromDate))
    .lte("created_at", istEndIso(filters.toDate))
    // Latest 200 (was unordered — an arbitrary 200)
    .order("created_at", { ascending: false })
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
  const leadDay = istDateKey(leadCreatedIso);
  const callDay = istDateKey(callLoggedIso);
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
    .gte("created_at", istStartIso(filters.fromDate))
    .lte("created_at", istEndIso(filters.toDate))
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
    const date = istDateKey(lead.created_at);
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
  const fromIso = istStartIso(filters.fromDate);
  const toIso = istEndIso(filters.toDate);

  const [sessions, leads, campsRes, spendRows, costRows] = await Promise.all([
    sessionsBySource(admin, fromIso, toIso),
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
          .order("id", { ascending: true }).range(from, to),
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
          .order("id", { ascending: true }).range(from, to),
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
          .order("id", { ascending: true }).range(from, to),
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
  // "Reached" from the shared funnel engine — a lead now in R2 still did R1
  const reachedById = new Map((await loadFunnelLeadsById(admin, leadIds)).map((f) => [f.id, f.at]));
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
    byChannel.get(key)!.sessions += s.sessions;
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
    const at = reachedById.get(l.id) ?? {};
    if (at.r1Booked) row.r1 += 1;
    if (at.r2Booked) row.r2 += 1;
    if (at.r3Booked) row.r3 += 1;
    if (at.offer) row.offer += 1;
    if (at.convert) row.converts += 1;
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
    keyPrefix: "marketing-channel-funnel-v2-reached",
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
  const fromIso = istStartIso(fromDate);
  const toIso = istEndIso(toDate);
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
          .order("id", { ascending: true }).range(from, to),
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
              .order("id", { ascending: true }).range(from, to);
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
    keyPrefix: "marketing-month-pnl-ist",
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
