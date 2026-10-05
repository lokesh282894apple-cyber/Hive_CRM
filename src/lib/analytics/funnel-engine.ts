/**
 * One source of truth for "when did a lead reach each funnel milestone".
 *
 * Every dashboard that counts R1 / R2 / R3 / Offer / Convert (Leads funnel,
 * Cost tables, Marketing P&L, Counselor funnel) uses these dates so the same
 * question gives the same number everywhere.
 *
 * Definitions (agreed with the team, docs/crm-change-plan.md §E):
 *  - Rn Booked    = first time the lead entered any Rn stage (stage-entry date).
 *  - Rn Completed = the interview date: scheduled time of the first Rn booking
 *                   that has a panel outcome. Without a booking, the first entry
 *                   into an "Rn held" stage (confirmed / TBB / reject) or a later
 *                   round.
 *  - Offer        = first entry into offered / offered_accepted / offer
 *                   student-reject / closed_paid.
 *  - Convert      = first entry into closed_paid.
 *  - A lead counts once per milestone, ever.
 *  - Reaching a later round implies the earlier one (R2 booked ⇒ R1 booked and
 *    completed, on the earliest date we know). Offer does not imply R3 — not
 *    every lead needs three rounds.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/supabase/paginate";
import { isInorganicLead } from "@/lib/marketing/metrics";

export const MILESTONES = [
  "r1Booked",
  "r1Completed",
  "r2Booked",
  "r2Completed",
  "r3Booked",
  "r3Completed",
  "offer",
  "convert",
] as const;
export type Milestone = (typeof MILESTONES)[number];

export const MILESTONE_LABELS: Record<Milestone, string> = {
  r1Booked: "R1 Booked",
  r1Completed: "R1 Completed",
  r2Booked: "R2 Booked",
  r2Completed: "R2 Completed",
  r3Booked: "R3 Booked",
  r3Completed: "R3 Completed",
  offer: "Offer",
  convert: "Convert",
};

const ROUND_STAGES: Record<1 | 2 | 3, string[]> = {
  1: ["r1_booked", "r1_confirmed", "r1_reject", "r1_no_show", "r1_reschedule", "r1_student_reject"],
  2: ["r2_booked", "r2_tbb", "r2_reject", "r2_no_show", "r2_reschedule", "r2_student_reject"],
  3: ["r3_booked", "r3_tbb", "r3_reject", "r3_no_show", "r3_reschedule", "r3_student_reject"],
};
const HELD_STAGES: Record<1 | 2 | 3, string[]> = {
  1: ["r1_confirmed", "r1_reject"],
  2: ["r2_tbb", "r2_reject"],
  3: ["r3_tbb", "r3_reject"],
};
const POST_INTERVIEW = ["yet_to_offer", "offered", "offered_accepted", "student_reject", "closed_paid"];
export const PAST_STUDENT_SOURCE = "past_student";
const OFFER_STAGES = ["offered", "offered_accepted", "student_reject", "closed_paid"];

export type FunnelLead = {
  id: string;
  createdAt: string;
  stage: string;
  ownerId: string | null;
  inorganic: boolean;
  programme: string | null;
  cohortId: string | null;
  courseId: string | null;
  /** ISO timestamp per milestone reached */
  at: Partial<Record<Milestone, string>>;
  /** Every stage the lead has ever entered */
  stagesEver: string[];
};

type HistoryRow = { lead_id: string; to_stage: string; changed_at: string };
type BookingRow = { lead_id: string; round: string; scheduled_at: string; outcome: string | null };

const minIso = (...v: (string | undefined)[]) =>
  v.filter((x): x is string => !!x).sort()[0];

/** Pure: milestone dates for one lead from its full history and bookings. */
export function milestonesFor(history: HistoryRow[], bookings: BookingRow[]): Partial<Record<Milestone, string>> {
  const firstEntry = new Map<string, string>();
  for (const h of history) {
    const cur = firstEntry.get(h.to_stage);
    if (!cur || h.changed_at < cur) firstEntry.set(h.to_stage, h.changed_at);
  }
  const first = (stages: string[]) => minIso(...stages.map((s) => firstEntry.get(s)));

  const bookedRaw = {
    1: first(ROUND_STAGES[1]),
    2: first(ROUND_STAGES[2]),
    3: first(ROUND_STAGES[3]),
  };
  const heldBooking = (n: 1 | 2 | 3) =>
    minIso(
      ...bookings
        .filter((b) => b.round === `R${n}` && b.outcome != null)
        .map((b) => b.scheduled_at)
    );
  const anyBooking = (n: 1 | 2 | 3) =>
    minIso(...bookings.filter((b) => b.round === `R${n}`).map((b) => b.scheduled_at));
  const postInterview = first(POST_INTERVIEW);

  const at: Partial<Record<Milestone, string>> = {};
  // Walk rounds from the last one back so later rounds imply earlier ones.
  // A booking row with no matching stage still means the round was booked.
  const r3Booked = bookedRaw[3] ?? anyBooking(3);
  const r3Completed = r3Booked ? heldBooking(3) ?? minIso(first(HELD_STAGES[3]), postInterview) : undefined;
  const r2Booked = minIso(bookedRaw[2], r3Booked) ?? anyBooking(2);
  const r2Completed = r2Booked
    ? heldBooking(2) ?? minIso(first(HELD_STAGES[2]), r3Booked ?? postInterview)
    : undefined;
  const r1Booked = minIso(bookedRaw[1], r2Booked) ?? anyBooking(1) ?? postInterview;
  const r1Completed = r1Booked
    ? heldBooking(1) ?? minIso(first(HELD_STAGES[1]), r2Booked ?? postInterview)
    : undefined;

  if (r1Booked) at.r1Booked = r1Booked;
  if (r1Completed) at.r1Completed = r1Completed;
  if (r2Booked) at.r2Booked = r2Booked;
  if (r2Completed) at.r2Completed = r2Completed;
  if (r3Booked) at.r3Booked = r3Booked;
  if (r3Completed) at.r3Completed = r3Completed;
  const offer = first(OFFER_STAGES);
  if (offer) at.offer = offer;
  const convert = firstEntry.get("closed_paid");
  if (convert) at.convert = convert;
  // Normalise to UTC "…Z" so callers can compare with range bounds as strings
  for (const m of MILESTONES) {
    const v = at[m];
    if (v) at[m] = new Date(v).toISOString();
  }
  return at;
}

const IN_CHUNK = 150;
const IN_CONCURRENCY = 12;

async function inChunks<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  label: string
): Promise<T[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) chunks.push(ids.slice(i, i + IN_CHUNK));
  const out: T[] = [];
  for (let i = 0; i < chunks.length; i += IN_CONCURRENCY) {
    const res = await Promise.all(chunks.slice(i, i + IN_CONCURRENCY).map(run));
    for (const r of res) {
      if (r.error) throw new Error(`${label}: ${r.error.message}`);
      out.push(...((r.data as T[]) ?? []));
    }
  }
  return out;
}

/**
 * Load every lead that matters for [fromIso, toIso]: created in the range
 * (cohort view) or reached a milestone in it (event view) — with full history
 * so "first time" is really the first time.
 */
export async function loadFunnelLeads(
  admin: SupabaseClient,
  fromIso: string,
  toIso: string
): Promise<FunnelLead[]> {
  const fast = await loadViaRpc(admin, { p_from: fromIso, p_to: toIso, p_ids: null });
  if (fast) return fast;
  const [created, historyInRange, bookingsInRange] = await Promise.all([
    fetchAllPages<{ id: string }>(
      (from, to) =>
        admin
          .from("leads")
          .select("id")
          .gte("created_at", fromIso)
          .lte("created_at", toIso)
          .order("id", { ascending: true })
          .range(from, to),
      "funnel.leadsCreated"
    ),
    fetchAllPages<{ lead_id: string }>(
      (from, to) =>
        admin
          .from("stage_history")
          .select("lead_id")
          .gte("changed_at", fromIso)
          .lte("changed_at", toIso)
          .order("id", { ascending: true })
          .range(from, to),
      "funnel.historyInRange"
    ),
    fetchAllPages<{ lead_id: string }>(
      (from, to) =>
        admin
          .from("interview_bookings")
          .select("lead_id")
          .gte("scheduled_at", fromIso)
          .lte("scheduled_at", toIso)
          .order("id", { ascending: true })
          .range(from, to),
      "funnel.bookingsInRange"
    ),
  ]);

  const ids = Array.from(
    new Set([
      ...created.map((r) => r.id),
      ...historyInRange.map((r) => r.lead_id),
      ...bookingsInRange.map((r) => r.lead_id),
    ])
  );
  return loadFunnelLeadsById(admin, ids);
}

/** Same as loadFunnelLeads for an explicit set of lead ids. */
export async function loadFunnelLeadsById(admin: SupabaseClient, ids: string[]): Promise<FunnelLead[]> {
  if (!ids.length) return [];
  const fast = await loadViaRpc(admin, { p_from: null, p_to: null, p_ids: ids });
  if (fast) return fast;
  return loadFunnelLeadsByIdRows(admin, ids);
}

type RpcLead = {
  id: string;
  created_at: string;
  stage: string;
  owner: string | null;
  source: string | null;
  utm_medium: string | null;
  programme: string | null;
  cohort_id: string | null;
  course_id: string | null;
  campaign_source_type: string | null;
  first_entry: Record<string, string>;
  bookings: { round: string; scheduled_at: string; outcome: string | null }[];
};

/**
 * One database call (rpc_funnel_leads, migration 20261005100000) instead of
 * paging four tables in chunks. Returns null when the function isn't there
 * yet so callers fall back to the row path — same results either way.
 */
async function loadViaRpc(
  admin: SupabaseClient,
  // All three args always: an older, unused 2-argument rpc_funnel_leads
  // (20260927010000_analytics_fast_rpc) shares the name, and passing only
  // the dates made PostgREST unable to pick one.
  args: { p_from: string | null; p_to: string | null; p_ids: string[] | null }
): Promise<FunnelLead[] | null> {
  const { data, error } = await admin.rpc("rpc_funnel_leads", args);
  if (error) {
    // Any failure → the row path (same numbers, slower) instead of a broken page
    console.error("[funnel-engine] rpc_funnel_leads failed, using row path:", error.message);
    return null;
  }
  return ((data ?? []) as RpcLead[])
    .filter((l) => l.source !== PAST_STUDENT_SOURCE)
    .map((l) => {
      // First entry per stage is all milestonesFor needs from history
      const history: HistoryRow[] = Object.entries(l.first_entry ?? {}).map(([to_stage, changed_at]) => ({
        lead_id: l.id,
        to_stage,
        changed_at,
      }));
      const bookings: BookingRow[] = (l.bookings ?? []).map((b) => ({ lead_id: l.id, ...b }));
      return {
        id: l.id,
        createdAt: new Date(l.created_at).toISOString(),
        stage: l.stage,
        ownerId: l.owner,
        inorganic: isInorganicLead({
          utm_medium: l.utm_medium,
          source: l.source,
          campaignSourceType: l.campaign_source_type,
        }),
        programme: l.programme,
        cohortId: l.cohort_id,
        courseId: l.course_id,
        at: milestonesFor(history, bookings),
        stagesEver: Array.from(new Set([...history.map((h) => h.to_stage), l.stage])),
      };
    });
}

/** Row-by-row path — fallback, and used by /api/admin/verify-metrics as the parity reference. */
export async function loadFunnelLeadsByIdRows(admin: SupabaseClient, ids: string[]): Promise<FunnelLead[]> {
  const [leads, history, bookings, attrs, camps] = await Promise.all([
    inChunks<{
      id: string;
      created_at: string;
      stage: string;
      lead_allocated_to: string | null;
      source: string | null;
      utm_medium: string | null;
      programme: string | null;
      cohort_id: string | null;
      course_id: string | null;
    }>(
      ids,
      (c) =>
        admin
          .from("leads")
          .select("id, created_at, stage, lead_allocated_to, source, utm_medium, programme, cohort_id, course_id")
          .in("id", c),
      "funnel.leads"
    ),
    inChunks<HistoryRow>(
      ids,
      (c) => admin.from("stage_history").select("lead_id, to_stage, changed_at").in("lead_id", c).limit(20000),
      "funnel.history"
    ),
    inChunks<BookingRow>(
      ids,
      (c) => admin.from("interview_bookings").select("lead_id, round, scheduled_at, outcome").in("lead_id", c),
      "funnel.bookings"
    ),
    inChunks<{ lead_id: string; first_touch_campaign_id: string | null }>(
      ids,
      (c) => admin.from("lead_attribution").select("lead_id, first_touch_campaign_id").in("lead_id", c),
      "funnel.attribution"
    ),
    admin.from("campaigns").select("id, source_type"),
  ]);

  const campType = new Map(((camps.data ?? []) as { id: string; source_type: string }[]).map((c) => [c.id, c.source_type]));
  const attrBy = new Map(attrs.map((a) => [a.lead_id, a.first_touch_campaign_id]));
  const histBy = new Map<string, HistoryRow[]>();
  for (const h of history) {
    const arr = histBy.get(h.lead_id) ?? [];
    arr.push(h);
    histBy.set(h.lead_id, arr);
  }
  const bookBy = new Map<string, BookingRow[]>();
  for (const b of bookings) {
    const arr = bookBy.get(b.lead_id) ?? [];
    arr.push(b);
    bookBy.set(b.lead_id, arr);
  }

  // Past students are entered by hand with a back-dated enrolment — they were
  // never marketing leads in the CRM (the archived sheet covers those months)
  return leads.filter((l) => l.source !== PAST_STUDENT_SOURCE).map((l) => {
    const camp = attrBy.get(l.id);
    return {
      id: l.id,
      createdAt: new Date(l.created_at).toISOString(),
      stage: l.stage,
      ownerId: l.lead_allocated_to,
      inorganic: isInorganicLead({
        utm_medium: l.utm_medium,
        source: l.source,
        campaignSourceType: camp ? campType.get(camp) ?? null : null,
      }),
      programme: l.programme,
      cohortId: l.cohort_id,
      courseId: l.course_id,
      at: milestonesFor(histBy.get(l.id) ?? [], bookBy.get(l.id) ?? []),
      stagesEver: Array.from(new Set([...(histBy.get(l.id) ?? []).map((h) => h.to_stage), l.stage])),
    };
  });
}

export type SplitCount = { total: number; org: number; inorg: number };
export type FunnelCounts = { leads: SplitCount } & Record<Milestone, SplitCount>;

export const emptySplit = (): SplitCount => ({ total: 0, org: 0, inorg: 0 });
export function emptyFunnelCounts(): FunnelCounts {
  const c = { leads: emptySplit() } as FunnelCounts;
  for (const m of MILESTONES) c[m] = emptySplit();
  return c;
}
export function addCounts(into: FunnelCounts, from: FunnelCounts) {
  for (const k of ["leads", ...MILESTONES] as const) {
    into[k].total += from[k].total;
    into[k].org += from[k].org;
    into[k].inorg += from[k].inorg;
  }
}
function bump(s: SplitCount, inorganic: boolean) {
  s.total += 1;
  if (inorganic) s.inorg += 1;
  else s.org += 1;
}

/** "event": count each milestone on the day it happened.
 *  "cohort": count each milestone against the day the lead was created. */
export type FunnelBasis = "event" | "cohort";

/**
 * Bucket leads into periods. `bucketOf` maps an ISO timestamp to a period key
 * (IST day / week / month) or null when outside the range.
 */
export function bucketFunnel(
  leads: FunnelLead[],
  basis: FunnelBasis,
  bucketOf: (iso: string) => string | null
): Map<string, FunnelCounts> {
  const out = new Map<string, FunnelCounts>();
  const get = (k: string) => {
    let c = out.get(k);
    if (!c) {
      c = emptyFunnelCounts();
      out.set(k, c);
    }
    return c;
  };
  for (const l of leads) {
    const createdKey = bucketOf(l.createdAt);
    if (createdKey) bump(get(createdKey).leads, l.inorganic);
    for (const m of MILESTONES) {
      const at = l.at[m];
      if (!at) continue;
      const key = basis === "cohort" ? createdKey : bucketOf(at);
      if (key) bump(get(key)[m], l.inorganic);
    }
  }
  return out;
}
