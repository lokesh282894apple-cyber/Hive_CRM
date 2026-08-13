import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdmissionsBase } from "@/lib/analytics/admissions-base";

export type FunnelAttribution = "all" | "organic" | "inorganic";
export type FunnelMode = "period" | "snapshot";
export type RoundKey = "R1" | "R2" | "R3";

export type RoundRates = {
  noShow: number | null;
  reschedule: number | null;
  conducted: number | null;
  moved: number | null;
  reject: number | null;
};

export type RoundMetrics = {
  onCalendar: number;
  noShow: number;
  reschedule: number;
  conducted: number;
  moved: number;
  reject: number;
  yetToMove: number;
  rates: RoundRates;
  weakest: { key: string; rate: number | null } | null;
};

export type OfferMetrics = {
  offered: number;
  won: number;
  lost: number;
  rates: { won: number | null; lost: number | null };
};

export type ConversionPercents = {
  r1BookedToOffered: number | null;
  r2BookedToOffered: number | null;
  r3BookedToOffered: number | null;
  r1BookedToConverts: number | null;
  r2BookedToConverts: number | null;
  r3BookedToConverts: number | null;
  offeredToConverts: number | null;
  leadsToConverts: number | null;
};

export type DayRoundCounts = {
  onCalendar: number;
  conducted: number;
  reschedule: number;
  noShow: number;
  moved: number;
  yetToMove: number;
  reject: number;
};

export type DayWiseRow = {
  date: string;
  r1: DayRoundCounts;
  r2: DayRoundCounts;
  r3: DayRoundCounts;
};

export type WeekRollup = {
  label: string;
  startDate: string;
  endDate: string;
  r1: DayRoundCounts;
  r2: DayRoundCounts;
  r1Rates: RoundRates;
  r2Rates: RoundRates;
};

export type LeadTotals = {
  total: number;
  organic: number;
  inorganic: number;
};

export type CohortFunnelSummary = {
  id: string;
  name: string;
  leadTotals: LeadTotals;
  roundFunnel: Record<RoundKey, RoundMetrics>;
  offerFunnel: OfferMetrics;
};

export type AdmissionsPulse = {
  r1OnCalendar: number;
  conductedPct: number | null;
  offered: number;
  won: number;
  weakestLeak: { label: string; rate: number | null } | null;
};

export type MonthStripRow = {
  month: string;
  label: string;
  leadTotals: LeadTotals;
  r1OnCalendar: number;
  offered: number;
  won: number;
};

export type AdmissionsFunnel = {
  month: string;
  mode: FunnelMode;
  attribution: FunnelAttribution;
  leadTotals: LeadTotals;
  roundFunnel: Record<RoundKey, RoundMetrics>;
  offerFunnel: OfferMetrics;
  conversionPercents: ConversionPercents;
  byMonth: MonthStripRow[];
  dayWise: DayWiseRow[];
  weekRollups: WeekRollup[];
  byCohort: CohortFunnelSummary[];
  pulse: AdmissionsPulse;
  organic: {
    leadTotals: LeadTotals;
    roundFunnel: Record<RoundKey, RoundMetrics>;
    offerFunnel: OfferMetrics;
  };
  inorganic: {
    leadTotals: LeadTotals;
    roundFunnel: Record<RoundKey, RoundMetrics>;
    offerFunnel: OfferMetrics;
  };
};

type LeadRow = {
  id: string;
  stage: string;
  source: string | null;
  course_id: string | null;
  cohort_id: string | null;
  lead_allocated_to: string | null;
  created_at: string;
};

type HistoryRow = {
  lead_id: string;
  to_stage: string;
  changed_at: string;
};

type BookingRow = {
  lead_id: string;
  round: string;
  scheduled_at: string;
  outcome: string | null;
};

type AttrClass = "organic" | "inorganic";

const R1_BOOKED = new Set(["r1_booked"]);
const R1_CONDUCTED = new Set(["r1_confirmed", "r1_reject"]);
const R1_NO_SHOW = new Set(["r1_no_show"]);
const R1_RESCH = new Set(["r1_reschedule"]);
const R1_REJECT = new Set(["r1_reject"]);
const R1_ALL = new Set([
  "r1_booked",
  "r1_confirmed",
  "r1_reject",
  "r1_no_show",
  "r1_reschedule",
]);

const R2_BOOKED = new Set(["r2_booked"]);
const R2_CONDUCTED = new Set(["r2_tbb", "r2_reject"]);
const R2_NO_SHOW = new Set(["r2_no_show"]);
const R2_RESCH = new Set(["r2_reschedule"]);
const R2_REJECT = new Set(["r2_reject"]);
const R2_ALL = new Set([
  "r2_booked",
  "r2_tbb",
  "r2_reject",
  "r2_no_show",
  "r2_reschedule",
]);
const R2_PLUS = new Set([
  ...Array.from(R2_ALL),
  "r3_booked",
  "r3_tbb",
  "r3_no_show",
  "r3_reschedule",
  "yet_to_offer",
  "offered",
  "closed_won",
  "closed_lost",
]);

const R3_BOOKED = new Set(["r3_booked"]);
const R3_CONDUCTED = new Set(["r3_tbb"]);
const R3_NO_SHOW = new Set(["r3_no_show"]);
const R3_RESCH = new Set(["r3_reschedule"]);
const R3_ALL = new Set([
  "r3_booked",
  "r3_tbb",
  "r3_no_show",
  "r3_reschedule",
]);
const R3_PLUS = new Set([
  ...Array.from(R3_ALL),
  "yet_to_offer",
  "offered",
  "closed_won",
  "closed_lost",
]);

const OFFER_PLUS = new Set(["yet_to_offer", "offered", "closed_won", "closed_lost"]);
const WON = new Set(["closed_won"]);
const LOST = new Set(["closed_lost"]);

const ORGANIC_SOURCES = new Set([
  "website",
  "referral",
  "walk_in",
  "partner",
  "other",
]);

function rate(to: number, from: number): number | null {
  if (from <= 0) return null;
  return (to / from) * 100;
}

function emptyDayCounts(): DayRoundCounts {
  return {
    onCalendar: 0,
    conducted: 0,
    reschedule: 0,
    noShow: 0,
    moved: 0,
    yetToMove: 0,
    reject: 0,
  };
}

function withRates(m: Omit<RoundMetrics, "rates" | "weakest">): RoundMetrics {
  const rates: RoundRates = {
    noShow: rate(m.noShow, m.onCalendar),
    reschedule: rate(m.reschedule, m.onCalendar),
    conducted: rate(m.conducted, m.onCalendar),
    moved: rate(m.moved, m.conducted),
    reject: rate(m.reject, m.conducted),
  };
  const leakable = [
    { key: "On-cal → Conducted", rate: rates.conducted },
    { key: "Conducted → Moved", rate: rates.moved },
  ].filter((c): c is { key: string; rate: number } => c.rate != null);
  const weakest =
    leakable.length > 0
      ? [...leakable].sort((a, b) => a.rate - b.rate)[0] ?? null
      : null;
  return { ...m, rates, weakest };
}

function monthBounds(month: string): { start: string; end: string; endExclusive: string } {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const endDate = new Date(Date.UTC(y!, m!, 0)); // last day of month via day 0 of next
  // Correct: new Date(y, m, 0) where m is 1-indexed month number
  const last = new Date(y!, m!, 0);
  const end = `${month}-${String(last.getDate()).padStart(2, "0")}`;
  const next =
    m === 12
      ? `${y! + 1}-01-01`
      : `${y!}-${String(m! + 1).padStart(2, "0")}-01`;
  void endDate;
  return { start, end, endExclusive: next };
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y!, m! - 1, 1);
  return d.toLocaleString("en-US", { month: "short", year: "2-digit" });
}

export function currentMonthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function daysInRange(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = new Date(start + "T12:00:00Z");
  const last = new Date(end + "T12:00:00Z");
  while (cur <= last) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function classifySource(
  source: string | null,
  campaignType: string | null | undefined
): AttrClass {
  if (campaignType === "paid_ad" || campaignType === "influencer") return "inorganic";
  if (campaignType === "organic") return "organic";
  if (source === "meta_ad") return "inorganic";
  if (source && ORGANIC_SOURCES.has(source)) return "organic";
  if (source?.includes("paid") || source?.includes("facebook") || source?.includes("meta")) {
    return "inorganic";
  }
  return "organic";
}

type LeadFacts = {
  lead: LeadRow;
  attr: AttrClass;
  stagesEver: Set<string>;
  stagesInPeriod: Set<string>;
  stagesByDay: Map<string, Set<string>>;
  bookings: BookingRow[];
};

function buildLeadFacts(
  leads: LeadRow[],
  history: HistoryRow[],
  bookings: BookingRow[],
  attrMap: Map<string, string | null>,
  periodStart: string,
  periodEndExclusive: string
): Map<string, LeadFacts> {
  const map = new Map<string, LeadFacts>();
  for (const lead of leads) {
    map.set(lead.id, {
      lead,
      attr: classifySource(lead.source, attrMap.get(lead.id)),
      stagesEver: new Set([lead.stage]),
      stagesInPeriod: new Set(),
      stagesByDay: new Map(),
      bookings: [],
    });
  }

  for (const h of history) {
    const f = map.get(h.lead_id);
    if (!f) continue;
    f.stagesEver.add(h.to_stage);
    const day = h.changed_at.slice(0, 10);
    if (day >= periodStart && day < periodEndExclusive) {
      f.stagesInPeriod.add(h.to_stage);
      let set = f.stagesByDay.get(day);
      if (!set) {
        set = new Set();
        f.stagesByDay.set(day, set);
      }
      set.add(h.to_stage);
    }
  }

  for (const b of bookings) {
    const f = map.get(b.lead_id);
    if (!f) continue;
    f.bookings.push(b);
    const day = b.scheduled_at.slice(0, 10);
    if (day >= periodStart && day < periodEndExclusive) {
      if (b.round === "R1") f.stagesInPeriod.add("r1_booked");
      if (b.round === "R2") f.stagesInPeriod.add("r2_booked");
      if (b.round === "R3") f.stagesInPeriod.add("r3_booked");
      if (b.outcome === "confirmed" || b.outcome === "reject" || b.outcome === "tbb") {
        if (b.round === "R1") {
          f.stagesInPeriod.add(b.outcome === "reject" ? "r1_reject" : "r1_confirmed");
        }
        if (b.round === "R2") {
          f.stagesInPeriod.add(b.outcome === "reject" ? "r2_reject" : "r2_tbb");
        }
        if (b.round === "R3") {
          f.stagesInPeriod.add("r3_tbb");
        }
      }
      let set = f.stagesByDay.get(day);
      if (!set) {
        set = new Set();
        f.stagesByDay.set(day, set);
      }
      if (b.round === "R1") set.add("r1_booked");
      if (b.round === "R2") set.add("r2_booked");
      if (b.round === "R3") set.add("r3_booked");
    }
  }

  return map;
}

function hasAny(set: Set<string>, stages: Set<string>) {
  return Array.from(stages).some((s) => set.has(s));
}

function computeRound(
  facts: LeadFacts[],
  mode: FunnelMode,
  round: RoundKey
): RoundMetrics {
  const allRound = round === "R1" ? R1_ALL : round === "R2" ? R2_ALL : R3_ALL;
  const conducted =
    round === "R1" ? R1_CONDUCTED : round === "R2" ? R2_CONDUCTED : R3_CONDUCTED;
  const noShow =
    round === "R1" ? R1_NO_SHOW : round === "R2" ? R2_NO_SHOW : R3_NO_SHOW;
  const resch =
    round === "R1" ? R1_RESCH : round === "R2" ? R2_RESCH : R3_RESCH;
  const reject =
    round === "R1" ? R1_REJECT : round === "R2" ? R2_REJECT : new Set<string>();
  const moved =
    round === "R1" ? R2_PLUS : round === "R2" ? R3_PLUS : OFFER_PLUS;

  let onCalendar = 0;
  let noShowN = 0;
  let reschN = 0;
  let conductedN = 0;
  let movedN = 0;
  let rejectN = 0;
  let yetN = 0;

  for (const f of facts) {
    const pool = mode === "snapshot" ? f.stagesEver : f.stagesInPeriod;
    const ever = f.stagesEver;
    const stageNow = f.lead.stage;

    const isOnCal =
      hasAny(pool, allRound) ||
      (mode === "snapshot" && f.bookings.some((b) => b.round === round));

    if (!isOnCal) continue;
    onCalendar += 1;

    const stagePool = mode === "snapshot" ? ever : pool;
    const wasConducted =
      hasAny(stagePool, conducted) ||
      f.bookings.some(
        (b) =>
          b.round === round &&
          b.outcome != null &&
          ["confirmed", "reject", "tbb"].includes(b.outcome) &&
          (mode === "snapshot" || hasAny(pool, allRound))
      );
    const wasNoShow =
      hasAny(stagePool, noShow) || (mode === "snapshot" && noShow.has(stageNow));
    const wasResch =
      hasAny(stagePool, resch) || (mode === "snapshot" && resch.has(stageNow));
    const wasReject =
      hasAny(stagePool, reject) ||
      f.bookings.some((b) => b.round === round && b.outcome === "reject") ||
      (mode === "snapshot" && reject.has(stageNow));
    const wasMoved = hasAny(ever, moved);

    if (wasConducted) {
      conductedN += 1;
      if (wasReject) rejectN += 1;
      else if (wasMoved) movedN += 1;
      else yetN += 1;
    } else if (wasNoShow) {
      noShowN += 1;
    } else if (wasResch) {
      reschN += 1;
    }
  }

  return withRates({
    onCalendar,
    noShow: noShowN,
    reschedule: reschN,
    conducted: conductedN,
    moved: movedN,
    reject: rejectN,
    yetToMove: yetN,
  });
}

function computeOffer(facts: LeadFacts[]): OfferMetrics {
  let offered = 0;
  let won = 0;
  let lost = 0;
  for (const f of facts) {
    if (!hasAny(f.stagesEver, OFFER_PLUS)) continue;
    offered += 1;
    if (hasAny(f.stagesEver, WON) || f.lead.stage === "closed_won") won += 1;
    else if (hasAny(f.stagesEver, LOST) || f.lead.stage === "closed_lost") lost += 1;
  }
  return {
    offered,
    won,
    lost,
    rates: { won: rate(won, offered), lost: rate(lost, offered) },
  };
}

function computeConversions(
  facts: LeadFacts[],
  offer: OfferMetrics
): ConversionPercents {
  let r1 = 0;
  let r2 = 0;
  let r3 = 0;
  let won = 0;
  for (const f of facts) {
    if (hasAny(f.stagesEver, R1_ALL) || f.bookings.some((b) => b.round === "R1")) r1 += 1;
    if (hasAny(f.stagesEver, R2_ALL) || f.bookings.some((b) => b.round === "R2")) r2 += 1;
    if (hasAny(f.stagesEver, R3_ALL) || f.bookings.some((b) => b.round === "R3")) r3 += 1;
    if (f.lead.stage === "closed_won" || hasAny(f.stagesEver, WON)) won += 1;
  }
  const leads = facts.length;
  return {
    r1BookedToOffered: rate(offer.offered, r1),
    r2BookedToOffered: rate(offer.offered, r2),
    r3BookedToOffered: rate(offer.offered, r3),
    r1BookedToConverts: rate(won, r1),
    r2BookedToConverts: rate(won, r2),
    r3BookedToConverts: rate(won, r3),
    offeredToConverts: rate(won, offer.offered),
    leadsToConverts: rate(won, leads),
  };
}

function leadTotalsOf(facts: LeadFacts[]): LeadTotals {
  let organic = 0;
  let inorganic = 0;
  for (const f of facts) {
    if (f.attr === "organic") organic += 1;
    else inorganic += 1;
  }
  return { total: facts.length, organic, inorganic };
}

function roundBundle(facts: LeadFacts[], mode: FunnelMode): Record<RoundKey, RoundMetrics> {
  return {
    R1: computeRound(facts, mode, "R1"),
    R2: computeRound(facts, mode, "R2"),
    R3: computeRound(facts, mode, "R3"),
  };
}

function dayCountsFor(
  facts: LeadFacts[],
  date: string,
  round: RoundKey
): DayRoundCounts {
  const booked = round === "R1" ? R1_BOOKED : round === "R2" ? R2_BOOKED : R3_BOOKED;
  const allRound = round === "R1" ? R1_ALL : round === "R2" ? R2_ALL : R3_ALL;
  const conducted =
    round === "R1" ? R1_CONDUCTED : round === "R2" ? R2_CONDUCTED : R3_CONDUCTED;
  const noShow =
    round === "R1" ? R1_NO_SHOW : round === "R2" ? R2_NO_SHOW : R3_NO_SHOW;
  const resch =
    round === "R1" ? R1_RESCH : round === "R2" ? R2_RESCH : R3_RESCH;
  const reject =
    round === "R1" ? R1_REJECT : round === "R2" ? R2_REJECT : new Set<string>();
  const moved =
    round === "R1" ? R2_PLUS : round === "R2" ? R3_PLUS : OFFER_PLUS;

  const c = emptyDayCounts();
  for (const f of facts) {
    const dayStages = f.stagesByDay.get(date) ?? new Set<string>();
    const bookedToday =
      hasAny(dayStages, booked) ||
      f.bookings.some(
        (b) => b.round === round && b.scheduled_at.slice(0, 10) === date
      );
    if (!bookedToday && !hasAny(dayStages, allRound)) continue;
    if (!bookedToday) continue;
    c.onCalendar += 1;

    const wasConducted =
      hasAny(dayStages, conducted) ||
      f.bookings.some(
        (b) =>
          b.round === round &&
          b.scheduled_at.slice(0, 10) === date &&
          b.outcome != null
      );
    const wasNoShow = hasAny(dayStages, noShow);
    const wasResch = hasAny(dayStages, resch);
    const wasReject =
      hasAny(dayStages, reject) ||
      f.bookings.some(
        (b) =>
          b.round === round &&
          b.scheduled_at.slice(0, 10) === date &&
          b.outcome === "reject"
      );
    // moved: stage to next round on same day or ever after this booking day
    const wasMoved = hasAny(f.stagesEver, moved);

    if (wasConducted) {
      c.conducted += 1;
      if (wasReject) c.reject += 1;
      else if (wasMoved) c.moved += 1;
      else c.yetToMove += 1;
    } else if (wasNoShow) {
      c.noShow += 1;
    } else if (wasResch) {
      c.reschedule += 1;
    }
  }
  return c;
}

function sumDayCounts(rows: DayRoundCounts[]): DayRoundCounts {
  const c = emptyDayCounts();
  for (const r of rows) {
    c.onCalendar += r.onCalendar;
    c.conducted += r.conducted;
    c.reschedule += r.reschedule;
    c.noShow += r.noShow;
    c.moved += r.moved;
    c.yetToMove += r.yetToMove;
    c.reject += r.reject;
  }
  return c;
}

function ratesFromDay(c: DayRoundCounts): RoundRates {
  return {
    noShow: rate(c.noShow, c.onCalendar),
    reschedule: rate(c.reschedule, c.onCalendar),
    conducted: rate(c.conducted, c.onCalendar),
    moved: rate(c.moved, c.conducted),
    reject: rate(c.reject, c.conducted),
  };
}

function buildWeekRollups(dayWise: DayWiseRow[]): WeekRollup[] {
  if (dayWise.length === 0) return [];
  const weeks: WeekRollup[] = [];
  for (let i = 0; i < dayWise.length; i += 7) {
    const slice = dayWise.slice(i, i + 7);
    const n = Math.floor(i / 7) + 1;
    const r1 = sumDayCounts(slice.map((d) => d.r1));
    const r2 = sumDayCounts(slice.map((d) => d.r2));
    weeks.push({
      label: `Week ${n}`,
      startDate: slice[0]!.date,
      endDate: slice[slice.length - 1]!.date,
      r1,
      r2,
      r1Rates: ratesFromDay(r1),
      r2Rates: ratesFromDay(r2),
    });
  }
  return weeks;
}

function buildPulse(
  rounds: Record<RoundKey, RoundMetrics>,
  offer: OfferMetrics
): AdmissionsPulse {
  const r1 = rounds.R1;
  const leaks: { label: string; rate: number }[] = [];
  for (const [key, m] of Object.entries(rounds) as [RoundKey, RoundMetrics][]) {
    if (m.weakest?.rate != null) {
      leaks.push({ label: `${key}: ${m.weakest.key}`, rate: m.weakest.rate });
    }
  }
  if (offer.rates.won != null) {
    leaks.push({ label: "Offer → Won", rate: offer.rates.won });
  }
  const weakestLeak =
    leaks.length > 0 ? [...leaks].sort((a, b) => a.rate - b.rate)[0]! : null;
  return {
    r1OnCalendar: r1.onCalendar,
    conductedPct: r1.rates.conducted,
    offered: offer.offered,
    won: offer.won,
    weakestLeak,
  };
}

function filterAttr(facts: LeadFacts[], attribution: FunnelAttribution): LeadFacts[] {
  if (attribution === "all") return facts;
  return facts.filter((f) => f.attr === attribution);
}

export async function fetchAdmissionsFunnel(
  supabase: SupabaseClient,
  opts?: {
    month?: string | null;
    fromDate?: string | null;
    toDate?: string | null;
    mode?: FunnelMode;
    attribution?: FunnelAttribution;
    counselorId?: string | null;
    courseId?: string | null;
    cohortId?: string | null;
  }
): Promise<AdmissionsFunnel> {
  const mode: FunnelMode = opts?.mode === "snapshot" ? "snapshot" : "period";
  const attribution: FunnelAttribution =
    opts?.attribution === "organic" || opts?.attribution === "inorganic"
      ? opts.attribution
      : "all";
  const counselorId = opts?.counselorId ?? null;
  const courseId = opts?.courseId ?? null;
  const cohortId = opts?.cohortId ?? null;

  const fromOk =
    opts?.fromDate && /^\d{4}-\d{2}-\d{2}$/.test(opts.fromDate)
      ? opts.fromDate
      : null;
  const toOk =
    opts?.toDate && /^\d{4}-\d{2}-\d{2}$/.test(opts.toDate) ? opts.toDate : null;

  let periodStart: string;
  let periodEnd: string;
  let endExclusive: string;
  let month: string;

  if (fromOk && toOk) {
    periodStart = fromOk <= toOk ? fromOk : toOk;
    periodEnd = fromOk <= toOk ? toOk : fromOk;
    const next = new Date(periodEnd + "T12:00:00Z");
    next.setUTCDate(next.getUTCDate() + 1);
    endExclusive = next.toISOString().slice(0, 10);
    month = periodEnd.slice(0, 7);
  } else {
    month =
      opts?.month && /^\d{4}-\d{2}$/.test(opts.month)
        ? opts.month
        : currentMonthKey();
    const b = monthBounds(month);
    periodStart = b.start;
    periodEnd = b.end;
    endExclusive = b.endExclusive;
  }

  const base = await getAdmissionsBase(counselorId, courseId, cohortId);
  // supabase retained for API compat — aggregates use service-role base
  void supabase;

  const leads = base.leads as LeadRow[];
  const history = base.history as HistoryRow[];
  const bookings = base.bookings.map((b) => ({
    lead_id: b.lead_id,
    round: b.round,
    scheduled_at: b.scheduled_at,
    outcome: b.outcome,
  })) as BookingRow[];

  const attrMap = new Map<string, string | null>();
  for (const r of base.attrs) {
    const cid = r.last_touch_campaign_id ?? r.first_touch_campaign_id;
    attrMap.set(r.lead_id, cid ? base.campaignTypeById.get(cid) ?? null : null);
  }

  const allFactsMap = buildLeadFacts(
    leads,
    history,
    bookings,
    attrMap,
    periodStart,
    endExclusive
  );
  const allFacts = Array.from(allFactsMap.values());
  const facts = filterAttr(allFacts, attribution);

  const roundFunnel = roundBundle(facts, mode);
  const offerFunnel = computeOffer(facts);
  const conversionPercents = computeConversions(facts, offerFunnel);
  const totals = leadTotalsOf(facts);

  const organicFacts = allFacts.filter((f) => f.attr === "organic");
  const inorganicFacts = allFacts.filter((f) => f.attr === "inorganic");

  const days = daysInRange(periodStart, periodEnd);
  const dayWise: DayWiseRow[] = days.map((date) => ({
    date,
    r1: dayCountsFor(facts, date, "R1"),
    r2: dayCountsFor(facts, date, "R2"),
    r3: dayCountsFor(facts, date, "R3"),
  }));
  const weekRollups = buildWeekRollups(dayWise);

  // Month strip: current + prior 5 months
  const byMonth: MonthStripRow[] = [];
  {
    const [y, m] = month.split("-").map(Number);
    for (let i = 5; i >= 0; i--) {
      let mm = m! - i;
      let yy = y!;
      while (mm <= 0) {
        mm += 12;
        yy -= 1;
      }
      const key = `${yy}-${String(mm).padStart(2, "0")}`;
      const b = monthBounds(key);
      const monthFactsMap = buildLeadFacts(
        leads,
        history,
        bookings,
        attrMap,
        b.start,
        b.endExclusive
      );
      const mf = filterAttr(Array.from(monthFactsMap.values()), attribution);
      const rf = roundBundle(mf, "period");
      const of = computeOffer(mf);
      byMonth.push({
        month: key,
        label: monthLabel(key),
        leadTotals: leadTotalsOf(mf),
        r1OnCalendar: rf.R1.onCalendar,
        offered: of.offered,
        won: of.won,
      });
    }
  }

  const cohorts = base.cohorts.map((c) => ({ id: c.id, name: c.name }));
  const byCohort: CohortFunnelSummary[] = cohorts
    .map((c) => {
      const cf = facts.filter((f) => f.lead.cohort_id === c.id);
      if (cf.length === 0) return null;
      return {
        id: c.id,
        name: c.name,
        leadTotals: leadTotalsOf(cf),
        roundFunnel: roundBundle(cf, mode),
        offerFunnel: computeOffer(cf),
      };
    })
    .filter(Boolean) as CohortFunnelSummary[];

  return {
    month,
    mode,
    attribution,
    leadTotals: totals,
    roundFunnel,
    offerFunnel,
    conversionPercents,
    byMonth,
    dayWise,
    weekRollups,
    byCohort,
    pulse: buildPulse(roundFunnel, offerFunnel),
    organic: {
      leadTotals: leadTotalsOf(organicFacts),
      roundFunnel: roundBundle(organicFacts, mode),
      offerFunnel: computeOffer(organicFacts),
    },
    inorganic: {
      leadTotals: leadTotalsOf(inorganicFacts),
      roundFunnel: roundBundle(inorganicFacts, mode),
      offerFunnel: computeOffer(inorganicFacts),
    },
  };
}
