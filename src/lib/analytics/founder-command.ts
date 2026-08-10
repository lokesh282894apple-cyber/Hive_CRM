import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchAdmissionsAnalytics,
  type AdmissionsAnalytics,
} from "@/lib/analytics/admissions";
import { OPEN_STAGES, type Stage } from "@/lib/constants";

export type Confidence = "low" | "medium" | "high";
export type FillVerdict = "on_track" | "at_risk" | "off_track" | "unset";

export type DayPoint = { date: string; value: number };
export type ConversionStep = {
  id: string;
  name: string;
  rate: number | null;
  fromCount: number;
  toCount: number;
};

export type CohortFillRow = {
  id: string;
  name: string;
  courseName: string | null;
  startDate: string | null;
  daysToStart: number | null;
  seats: number | null;
  open: number;
  offered: number;
  won: number;
  fillPct: number | null;
  projectedFill: number;
  projectedFillPct: number | null;
};

export type FounderCommand = {
  rangeDays: number;
  admissions: AdmissionsAnalytics;
  confidence: Confidence;
  confidenceReason: string;
  northStar: {
    verdict: FillVerdict;
    cohortId: string | null;
    cohortName: string | null;
    daysToStart: number | null;
    seats: number | null;
    won: number;
    open: number;
    offered: number;
    fillPct: number | null;
    projectedFill: number;
    projectedFillLow: number;
    projectedFillHigh: number;
    projectedFillPct: number | null;
    projectedFee: number;
    avgTicket: number;
    yieldRate: number;
    showRate: number | null;
    medianHoursToFirstCall: number | null;
    cashAtRisk: number;
  };
  pulse: {
    historyLeads: DayPoint[];
    historyWins: DayPoint[];
    forecastLeads: DayPoint[];
    forecastWins: DayPoint[];
  };
  cohortFillPath: {
    history: DayPoint[];
    forecast: DayPoint[];
    target: number | null;
  };
  conversions: ConversionStep[];
  biggestLeak: ConversionStep | null;
  cohorts: CohortFillRow[];
  money: {
    collected: number;
    outstanding: number;
    overdueCount: number;
    overdueAmount: number;
    expected14d: number;
    expected30d: number;
    weeklyCollected: { name: string; value: number }[];
    expectedBars: { name: string; value: number }[];
  };
  counselorExec: {
    id: string;
    name: string;
    open: number;
    calls: number;
    interviews: number;
    won: number;
    yieldRate: number;
    medianResponseHours: number | null;
  }[];
  cpe: {
    available: boolean;
    source: "ad_spend" | "manual" | null;
    spend: number;
    cpl: number | null;
    cpe: number | null;
  };
  targets: Record<string, number>;
  manualMonthlySpend: number | null;
};

const R1_STAGES = new Set([
  "r1_booked",
  "r1_confirmed",
  "r1_reject",
  "r1_no_show",
  "r1_reschedule",
]);
const R2_STAGES = new Set([
  "r2_booked",
  "r2_tbb",
  "r2_reject",
  "r2_no_show",
  "r2_reschedule",
]);
const OFFER_STAGES = new Set(["yet_to_offer", "offered"]);
const NO_SHOW_STAGES = new Set([
  "no_show",
  "r1_no_show",
  "r2_no_show",
  "r3_no_show",
]);
const INTERVIEW_TOUCHED = new Set<string>([
  ...Array.from(R1_STAGES),
  ...Array.from(R2_STAGES),
  "r3_booked",
  "r3_tbb",
  "r3_no_show",
  "r3_reschedule",
]);

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function addDays(isoDate: string, n: number) {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function parseTargets(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n) && n > 0) out[k] = Math.round(n);
  }
  return out;
}

function parseManualSpend(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (raw && typeof raw === "object" && "amount" in (raw as object)) {
    const n = Number((raw as { amount: unknown }).amount);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function rate(to: number, from: number): number | null {
  if (from <= 0) return null;
  return (to / from) * 100;
}

export async function fetchFounderCommand(
  supabase: SupabaseClient,
  opts?: { rangeDays?: number }
): Promise<FounderCommand> {
  const rangeDays = opts?.rangeDays ?? 30;
  const since = new Date();
  since.setDate(since.getDate() - rangeDays);
  const sinceIso = since.toISOString();
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const todayKey = today.toISOString().slice(0, 10);
  const in14 = addDays(todayKey, 14);
  const in30 = addDays(todayKey, 30);

  const [admissions, extras] = await Promise.all([
    fetchAdmissionsAnalytics(supabase, { rangeDays }),
    Promise.all([
      supabase
        .from("cohorts")
        .select("id, name, course_id, start_date, active")
        .eq("active", true),
      supabase.from("courses").select("id, name").eq("active", true),
      supabase.from("stage_history").select("lead_id, to_stage").limit(4000),
      supabase.from("interview_bookings").select("lead_id").limit(2000),
      supabase
        .from("installments")
        .select("deadline, amount_to_realise, amount_realised, status"),
      supabase
        .from("app_settings")
        .select("key, value")
        .in("key", ["enrollment_targets", "manual_monthly_ad_spend"]),
      supabase
        .from("ad_spend_daily")
        .select("spend")
        .gte("date", sinceIso.slice(0, 10))
        .limit(2000),
    ]),
  ]);

  const [
    cohortsRes,
    coursesRes,
    historyRes,
    bookingsRes,
    installmentsRes,
    settingsRes,
    spendRes,
  ] = extras;

  const allLeads = admissions.leadRows;
  const history = historyRes.data ?? [];
  const bookings = bookingsRes.data ?? [];
  const installments = installmentsRes.data ?? [];
  const settingsRows = settingsRes.data ?? [];
  const spendRows = spendRes.error ? [] : spendRes.data ?? [];
  const cohorts = cohortsRes.data ?? [];
  const courses = coursesRes.data ?? [];
  const callsForCounselor = admissions.callRows;

  const courseMap = new Map(courses.map((c) => [c.id, c.name]));
  const settingsMap = new Map(settingsRows.map((s) => [s.key, s.value]));
  const targets = parseTargets(settingsMap.get("enrollment_targets"));
  const manualMonthlySpend = parseManualSpend(
    settingsMap.get("manual_monthly_ad_spend")
  );

  const feeBooks = admissions.paymentModeMix.reduce((s, p) => s + p.count, 0);
  const avgTicket =
    feeBooks > 0 &&
    admissions.kpis.feeCollected + admissions.kpis.feeOutstanding > 0
      ? (admissions.kpis.feeCollected + admissions.kpis.feeOutstanding) / feeBooks
      : 0;

  const reached = {
    r1: new Set<string>(),
    r2: new Set<string>(),
    offer: new Set<string>(),
    won: new Set<string>(),
  };

  function markReached(leadId: string, stage: string) {
    if (
      R1_STAGES.has(stage) ||
      R2_STAGES.has(stage) ||
      stage.startsWith("r3_") ||
      OFFER_STAGES.has(stage) ||
      stage === "closed_won"
    ) {
      reached.r1.add(leadId);
    }
    if (
      R2_STAGES.has(stage) ||
      stage.startsWith("r3_") ||
      OFFER_STAGES.has(stage) ||
      stage === "closed_won"
    ) {
      reached.r2.add(leadId);
    }
    if (OFFER_STAGES.has(stage) || stage === "closed_won") {
      reached.offer.add(leadId);
    }
    if (stage === "closed_won") reached.won.add(leadId);
  }

  for (const h of history) markReached(h.lead_id, h.to_stage);
  for (const l of allLeads) markReached(l.id, l.stage);

  const totalLeads = Math.max(1, allLeads.length);
  const conversions: ConversionStep[] = [
    {
      id: "lead_r1",
      name: "Lead → R1",
      fromCount: totalLeads,
      toCount: reached.r1.size,
      rate: rate(reached.r1.size, totalLeads),
    },
    {
      id: "r1_r2",
      name: "R1 → R2",
      fromCount: Math.max(reached.r1.size, 1),
      toCount: reached.r2.size,
      rate: rate(reached.r2.size, reached.r1.size),
    },
    {
      id: "r2_offer",
      name: "R2 → Offer",
      fromCount: Math.max(reached.r2.size, 1),
      toCount: reached.offer.size,
      rate: rate(reached.offer.size, reached.r2.size),
    },
    {
      id: "offer_won",
      name: "Offer → Won",
      fromCount: Math.max(reached.offer.size, 1),
      toCount: reached.won.size,
      rate: rate(reached.won.size, reached.offer.size),
    },
  ];

  const stepsWithRate = conversions.filter(
    (c): c is ConversionStep & { rate: number } => c.rate != null
  );
  const biggestLeak =
    stepsWithRate.length > 0
      ? [...stepsWithRate].sort((a, b) => a.rate - b.rate)[0] ?? null
      : null;

  const yieldRate =
    reached.offer.size > 0
      ? (reached.won.size / reached.offer.size) * 100
      : admissions.kpis.winRate;

  const interviewTouched = allLeads.filter(
    (l) => INTERVIEW_TOUCHED.has(l.stage) || NO_SHOW_STAGES.has(l.stage)
  );
  const noShows = allLeads.filter((l) => NO_SHOW_STAGES.has(l.stage)).length;
  const showRate =
    interviewTouched.length > 0
      ? ((interviewTouched.length - noShows) / interviewTouched.length) * 100
      : null;

  const firstCallByLead = new Map<string, string>();
  // Prefer earliest call in range; fall back to last_contacted_at
  const callsSorted = [...callsForCounselor].sort((a, b) =>
    a.logged_at.localeCompare(b.logged_at)
  );
  for (const c of callsSorted) {
    if (!firstCallByLead.has(c.lead_id)) firstCallByLead.set(c.lead_id, c.logged_at);
  }
  for (const l of allLeads) {
    if (!firstCallByLead.has(l.id) && l.last_contacted_at) {
      firstCallByLead.set(l.id, l.last_contacted_at);
    }
  }
  const latencies: number[] = [];
  for (const l of allLeads) {
    if (l.created_at < sinceIso) continue;
    const first = firstCallByLead.get(l.id) ?? l.last_contacted_at;
    if (!first) continue;
    const hours =
      (new Date(first).getTime() - new Date(l.created_at).getTime()) / 3600000;
    if (hours >= 0 && hours < 24 * 60) latencies.push(hours);
  }
  const medianHoursToFirstCall = median(latencies);

  const overdue = installments.filter((i) => i.status === "overdue");
  const overdueAmount = overdue.reduce(
    (s, i) =>
      s + Math.max(0, Number(i.amount_to_realise) - Number(i.amount_realised)),
    0
  );
  let expected14d = 0;
  let expected30d = 0;
  for (const i of installments) {
    if (i.status === "paid") continue;
    const due = Number(i.amount_to_realise) - Number(i.amount_realised);
    if (due <= 0) continue;
    if (i.deadline <= in14) expected14d += due;
    if (i.deadline <= in30) expected30d += due;
  }

  const weeks = Math.max(1, Math.ceil(rangeDays / 7));
  const weeklyCollected = Array.from({ length: Math.min(weeks, 8) }, (_, i) => ({
    name: `W${i + 1}`,
    value: Math.round(admissions.kpis.feeCollected / weeks),
  }));
  const expectedBars = [
    { name: "Next 14d", value: Math.round(expected14d) },
    { name: "Next 30d", value: Math.round(expected30d) },
  ];

  const cohortRows: CohortFillRow[] = cohorts.map((c) => {
    const mine = allLeads.filter((l) => l.cohort_id === c.id);
    const open = mine.filter((l) => OPEN_STAGES.includes(l.stage as Stage)).length;
    const offered = mine.filter((l) => OFFER_STAGES.has(l.stage)).length;
    const won = mine.filter((l) => l.stage === "closed_won").length;
    const seats = targets[c.id] ?? null;
    const yieldFrac = yieldRate > 0 ? yieldRate / 100 : 0;
    const projectedFill = won + open * yieldFrac;
    let daysToStart: number | null = null;
    if (c.start_date) {
      daysToStart = Math.ceil(
        (new Date(c.start_date + "T12:00:00Z").getTime() - today.getTime()) /
          86400000
      );
    }
    return {
      id: c.id,
      name: c.name,
      courseName: c.course_id ? courseMap.get(c.course_id) ?? null : null,
      startDate: c.start_date,
      daysToStart,
      seats,
      open,
      offered,
      won,
      fillPct: seats ? (won / seats) * 100 : null,
      projectedFill,
      projectedFillPct: seats ? (projectedFill / seats) * 100 : null,
    };
  });

  const upcoming = [...cohortRows]
    .filter((c) => c.daysToStart == null || c.daysToStart >= -7)
    .sort((a, b) => (a.daysToStart ?? 9999) - (b.daysToStart ?? 9999));
  const focus =
    upcoming.find((c) => c.seats != null) ?? upcoming[0] ?? cohortRows[0] ?? null;

  const leadsInRange = admissions.daily.reduce((s, d) => s + d.leads, 0);
  const closed = admissions.kpis.won + admissions.kpis.lost;
  const confidence: Confidence =
    closed >= 20 && leadsInRange >= 30
      ? "high"
      : closed >= 5 || leadsInRange >= 10
        ? "medium"
        : "low";
  const confidenceReason =
    confidence === "high"
      ? `${closed} closed · ${leadsInRange} new in ${rangeDays}d`
      : confidence === "medium"
        ? `Thin sample — ${closed} closed, ${leadsInRange} new leads`
        : `Very thin data — treat forecasts as direction only`;

  const yieldFrac = yieldRate > 0 ? yieldRate / 100 : 0;
  const focusWon = focus?.won ?? admissions.kpis.won;
  const focusOpen = focus?.open ?? admissions.kpis.openLeads;
  const focusSeats = focus?.seats ?? null;
  const projectedFill = focusWon + focusOpen * yieldFrac;
  const band =
    confidence === "high" ? 0.08 : confidence === "medium" ? 0.18 : 0.35;
  const projectedFillLow = Math.max(focusWon, projectedFill * (1 - band));
  const projectedFillHigh = projectedFill * (1 + band);

  let verdict: FillVerdict = "unset";
  if (focusSeats != null && focusSeats > 0) {
    const pct = (projectedFill / focusSeats) * 100;
    if (pct >= 95) verdict = "on_track";
    else if (pct >= 70) verdict = "at_risk";
    else verdict = "off_track";
  }

  const projectedFee = avgTicket > 0 ? projectedFill * avgTicket : 0;

  const historyLeads = admissions.daily.map((d) => ({ date: d.date, value: d.leads }));
  const historyWins = admissions.daily.map((d) => ({ date: d.date, value: d.won }));
  const leadsPerDay = leadsInRange / Math.max(1, rangeDays);
  const winsPerDay =
    admissions.daily.reduce((s, d) => s + d.won, 0) / Math.max(1, rangeDays);
  const forecastLeads: DayPoint[] = [];
  const forecastWins: DayPoint[] = [];
  for (let i = 1; i <= 14; i++) {
    const date = addDays(todayKey, i);
    forecastLeads.push({ date, value: leadsPerDay });
    forecastWins.push({ date, value: winsPerDay });
  }

  const wonDateList = allLeads
    .filter((l) => {
      if (l.stage !== "closed_won") return false;
      if (focus?.id) return l.cohort_id === focus.id;
      return true;
    })
    .map((l) => dayKey(l.updated_at || l.created_at))
    .sort();
  const fillHistory: DayPoint[] = [];
  let cum = 0;
  const startFill = addDays(todayKey, -Math.min(rangeDays, 60));
  const span = Math.min(rangeDays, 60);
  for (let i = 0; i <= span; i++) {
    const date = addDays(startFill, i);
    while (wonDateList.length && wonDateList[0]! <= date) {
      wonDateList.shift();
      cum += 1;
    }
    fillHistory.push({ date, value: cum });
  }
  if (fillHistory.length) {
    fillHistory[fillHistory.length - 1]!.value = focusWon;
  }
  const fillForecast: DayPoint[] = [];
  const daysLeft = Math.max(
    1,
    focus?.daysToStart && focus.daysToStart > 0 ? focus.daysToStart : 30
  );
  const remaining = Math.max(0, projectedFill - focusWon);
  const forecastDays = Math.min(daysLeft, 45);
  for (let i = 1; i <= forecastDays; i++) {
    fillForecast.push({
      date: addDays(todayKey, i),
      value: focusWon + (remaining * i) / forecastDays,
    });
  }

  const callsByCounselor = new Map<string, number>();
  const responseHoursByCounselor = new Map<string, number[]>();
  const leadCreated = new Map(allLeads.map((l) => [l.id, l]));
  for (const c of callsForCounselor) {
    callsByCounselor.set(
      c.counselor_id,
      (callsByCounselor.get(c.counselor_id) ?? 0) + 1
    );
  }
  for (const entry of Array.from(firstCallByLead.entries())) {
    const leadId = entry[0];
    const loggedAt = entry[1];
    const lead = leadCreated.get(leadId);
    if (!lead?.lead_allocated_to) continue;
    const hours =
      (new Date(loggedAt).getTime() - new Date(lead.created_at).getTime()) /
      3600000;
    if (hours < 0 || hours > 24 * 60) continue;
    const arr = responseHoursByCounselor.get(lead.lead_allocated_to) ?? [];
    arr.push(hours);
    responseHoursByCounselor.set(lead.lead_allocated_to, arr);
  }
  const interviewsByCounselor = new Map<string, number>();
  for (const b of bookings) {
    const lead = leadCreated.get(b.lead_id);
    const cid = lead?.lead_allocated_to;
    if (!cid) continue;
    interviewsByCounselor.set(cid, (interviewsByCounselor.get(cid) ?? 0) + 1);
  }

  const counselorExec = admissions.counselorBoard.map((c) => ({
    id: c.id,
    name: c.name,
    open: c.open,
    calls: callsByCounselor.get(c.id) ?? 0,
    interviews: interviewsByCounselor.get(c.id) ?? 0,
    won: c.won,
    yieldRate: c.winRate,
    medianResponseHours: median(responseHoursByCounselor.get(c.id) ?? []),
  }));

  const spendFromAds = spendRows.reduce(
    (s, r) => s + Number(r.spend || 0),
    0
  );
  let cpeSource: FounderCommand["cpe"]["source"] = null;
  let spend = 0;
  if (spendFromAds > 0) {
    cpeSource = "ad_spend";
    spend = spendFromAds;
  } else if (manualMonthlySpend != null) {
    cpeSource = "manual";
    spend = manualMonthlySpend * (rangeDays / 30);
  }
  const wonInRange = Math.max(
    1,
    admissions.daily.reduce((s, d) => s + d.won, 0)
  );
  const leadsForCpl = Math.max(1, leadsInRange);

  return {
    rangeDays,
    admissions,
    confidence,
    confidenceReason,
    northStar: {
      verdict,
      cohortId: focus?.id ?? null,
      cohortName: focus?.name ?? null,
      daysToStart: focus?.daysToStart ?? null,
      seats: focusSeats,
      won: focusWon,
      open: focusOpen,
      offered: focus?.offered ?? 0,
      fillPct: focusSeats ? (focusWon / focusSeats) * 100 : null,
      projectedFill,
      projectedFillLow,
      projectedFillHigh,
      projectedFillPct: focusSeats ? (projectedFill / focusSeats) * 100 : null,
      projectedFee,
      avgTicket,
      yieldRate,
      showRate,
      medianHoursToFirstCall,
      cashAtRisk: overdueAmount + admissions.kpis.feeOutstanding * 0.25,
    },
    pulse: { historyLeads, historyWins, forecastLeads, forecastWins },
    cohortFillPath: {
      history: fillHistory,
      forecast: fillForecast,
      target: focusSeats,
    },
    conversions,
    biggestLeak,
    cohorts: cohortRows.sort(
      (a, b) => (a.daysToStart ?? 999) - (b.daysToStart ?? 999)
    ),
    money: {
      collected: admissions.kpis.feeCollected,
      outstanding: admissions.kpis.feeOutstanding,
      overdueCount: overdue.length,
      overdueAmount,
      expected14d,
      expected30d,
      weeklyCollected,
      expectedBars,
    },
    counselorExec,
    cpe: {
      available: cpeSource != null && spend > 0,
      source: cpeSource,
      spend,
      cpl: cpeSource ? spend / leadsForCpl : null,
      cpe: cpeSource ? spend / wonInRange : null,
    },
    targets,
    manualMonthlySpend,
  };
}
