/**
 * Empirical conversion model — logistic regression on historical closed_won / closed_lost.
 * Activates once enough labeled outcomes exist; otherwise expert engine stands alone.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScoreSignals } from "@/lib/leads/score";
import { buildScoreSignals } from "@/lib/leads/score";

export const CONVERSION_MODEL_KEY = "conversion_likelihood_model_v1";
export const MIN_LABELS_FOR_FIT = 40;
export const MIN_WINS = 10;
export const MIN_LOSSES = 10;

export type LearnedConversionModel = {
  version: 1;
  fittedAt: string;
  nWon: number;
  nLost: number;
  nTotal: number;
  featureNames: string[];
  weights: number[];
  baseRate: number;
  auc: number | null;
};

function clamp01(x: number) {
  return Math.min(0.999, Math.max(0.001, x));
}

export function logit(p: number) {
  const x = clamp01(p);
  return Math.log(x / (1 - x));
}

export function sigmoid(z: number) {
  if (z > 30) return 0.999;
  if (z < -30) return 0.001;
  return 1 / (1 + Math.exp(-z));
}

/** Stage-agnostic features for ML (avoid using current stage as a feature). */
export function featureVector(s: ScoreSignals): { names: string[]; values: number[] } {
  const calls = Math.max(1, s.callCount ?? 0);
  const connectRate = (s.connectedCalls ?? 0) / calls;
  const names = [
    "form_prior",
    "yoe_icp",
    "has_course",
    "has_cohort",
    "has_email",
    "has_linkedin",
    "source_referral",
    "source_inbound",
    "source_paid",
    "pageviews_norm",
    "high_intent_norm",
    "scroll_norm",
    "cta_norm",
    "revisit",
    "connect_rate",
    "callback",
    "dnp_rate",
    "wrong_number",
    "long_call",
    "note_interest",
    "note_objection",
    "note_urgency",
    "hours_to_first_call_fast",
    "recent_touch",
    "days_to_r1_fast",
    "r1",
    "r2",
    "r3",
    "confirmed",
    "reject",
    "feedback_pos",
    "has_offer_fee",
    "paid_installment",
    "loan_mode",
  ];

  const yoe = s.yearsExperience;
  const yoeIcp = yoe != null && yoe >= 2 && yoe <= 8 ? 1 : yoe != null ? 0.4 : 0;
  const src = (s.source || "").toLowerCase();
  const camp = (s.campaignSourceType || "").toLowerCase();
  const bookings = s.bookings ?? [];
  const rounds = new Set(bookings.map((b) => b.round));
  const confirmed = bookings.filter((b) => b.outcome === "confirmed").length;
  const reject = bookings.filter((b) => b.outcome === "reject").length;
  const fbPos = bookings.some((b) =>
    /\b(strong|excellent|great fit|hire|recommend|impressive|motivated)\b/i.test(
      b.feedback_notes || ""
    )
  )
    ? 1
    : 0;

  const values = [
    s.formIntentPrior != null ? s.formIntentPrior / 100 : 0.35,
    yoeIcp,
    s.courseId ? 1 : 0,
    s.cohortId ? 1 : 0,
    s.hasEmail ? 1 : 0,
    s.hasLinkedin ? 1 : 0,
    src.includes("referral") || src.includes("alumni") ? 1 : 0,
    /^website|organic|inbound/.test(src) || camp === "organic" ? 1 : 0,
    camp === "paid_ad" || /meta|google|paid|ads/.test(src) ? 1 : 0,
    Math.min(1, (s.pageviews ?? 0) / 12),
    Math.min(1, (s.highIntentPageviews ?? 0) / 4),
    (s.maxScrollDepth ?? 0) / 100,
    Math.min(1, (s.ctaClicks ?? 0) / 3),
    (s.revisitDays ?? 0) >= 1 ? 1 : 0,
    connectRate,
    (s.callbackRequests ?? 0) > 0 ? 1 : 0,
    Math.min(1, (s.dnpCalls ?? 0) / 4),
    (s.wrongNumberCalls ?? 0) > 0 ? 1 : 0,
    (s.maxCallDurationSec ?? 0) >= 180 ? 1 : 0,
    Math.min(1, (s.callNoteInterestHits ?? 0) / 2),
    Math.min(1, (s.callNoteObjectionHits ?? 0) / 2),
    (s.callNoteUrgencyHits ?? 0) > 0 ? 1 : 0,
    s.hoursToFirstCall != null && s.hoursToFirstCall <= 24 ? 1 : 0,
    s.recentCallDays != null && s.recentCallDays <= 7 ? 1 : 0,
    s.daysToFirstR1 != null && s.daysToFirstR1 <= 7 ? 1 : 0,
    rounds.has("R1") ? 1 : 0,
    rounds.has("R2") ? 1 : 0,
    rounds.has("R3") ? 1 : 0,
    Math.min(1, confirmed / 2),
    Math.min(1, reject / 2),
    fbPos,
    s.hasOfferFee ? 1 : 0,
    s.hasPaidInstallment ? 1 : 0,
    s.paymentMode === "loan" ? 1 : 0,
  ];

  return { names, values };
}

export function predictLearnedLogit(model: LearnedConversionModel, s: ScoreSignals): number {
  const { values } = featureVector(s);
  let z = model.weights[0] ?? logit(model.baseRate);
  for (let i = 0; i < values.length; i++) {
    z += (model.weights[i + 1] ?? 0) * values[i]!;
  }
  return z;
}

function trainLogistic(
  X: number[][],
  y: number[],
  steps = 450,
  lr = 0.08,
  l2 = 0.025
): number[] {
  const n = X.length;
  const d = X[0]?.length ?? 0;
  const w = new Array(d + 1).fill(0);
  w[0] = logit(y.reduce((a, b) => a + b, 0) / Math.max(1, n));

  for (let step = 0; step < steps; step++) {
    const grad = new Array(d + 1).fill(0);
    for (let i = 0; i < n; i++) {
      let z = w[0]!;
      for (let j = 0; j < d; j++) z += w[j + 1]! * X[i]![j]!;
      const p = sigmoid(z);
      const err = p - y[i]!;
      grad[0]! += err;
      for (let j = 0; j < d; j++) grad[j + 1]! += err * X[i]![j]!;
    }
    for (let j = 0; j < w.length; j++) {
      const reg = j === 0 ? 0 : l2 * w[j]!;
      w[j]! -= (lr / n) * (grad[j]! + reg);
    }
  }
  return w;
}

function aucScore(scores: { p: number; y: number }[]): number | null {
  const pos = scores.filter((s) => s.y === 1);
  const neg = scores.filter((s) => s.y === 0);
  if (pos.length < 5 || neg.length < 5) return null;
  let ok = 0;
  let total = 0;
  for (const p of pos) {
    for (const n of neg) {
      total += 1;
      if (p.p > n.p) ok += 1;
      else if (p.p === n.p) ok += 0.5;
    }
  }
  return total ? ok / total : null;
}

function signalsFromClosedLead(row: {
  source: string | null;
  programme?: string | null;
  years_experience: number | null;
  preferred_industry: string | null;
  course_id: string | null;
  cohort_id: string | null;
  created_at: string;
  email: string | null;
  linkedin: string | null;
  intent_score: number | null;
  bookings: {
    round: string;
    outcome: string | null;
    feedback_notes: string | null;
    scheduled_at: string | null;
  }[];
  calls: {
    logged_at: string;
    outcome: string | null;
    duration: number | null;
    notes: string | null;
  }[];
  history: { from_stage: string | null; to_stage: string; changed_at: string }[];
  fee: {
    total_fee: number;
    remaining_fee: number;
    list_price: number | null;
    payment_mode: string | null;
  } | null;
}): ScoreSignals {
  return buildScoreSignals({
    stage: "new_lead",
    source: row.source,
    programme: row.programme,
    yearsExperience: row.years_experience,
    preferredIndustry: row.preferred_industry,
    courseId: row.course_id,
    cohortId: row.cohort_id,
    createdAt: row.created_at,
    email: row.email,
    linkedin: row.linkedin,
    intentScore: row.intent_score,
    scoreAuto: null,
    bookings: row.bookings,
    calls: row.calls,
    stageHistory: row.history,
    fee: row.fee,
  });
}

export async function fitConversionModel(
  supabase: SupabaseClient
): Promise<LearnedConversionModel | null> {
  const { data: closed } = await supabase
    .from("leads")
    .select(
      "id, stage, source, programme, years_experience, preferred_industry, course_id, cohort_id, created_at, email, linkedin, intent_score"
    )
    .in("stage", ["closed_won", "closed_lost"])
    .limit(5000);

  const leads = closed ?? [];
  const nWon = leads.filter((l) => l.stage === "closed_won").length;
  const nLost = leads.filter((l) => l.stage === "closed_lost").length;
  if (leads.length < MIN_LABELS_FOR_FIT || nWon < MIN_WINS || nLost < MIN_LOSSES) {
    return null;
  }

  const rows: { x: number[]; y: number }[] = [];
  const ids = leads.map((l) => l.id);

  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40);
    const leadChunk = leads.filter((l) => chunk.includes(l.id));
    const [
      { data: bookings },
      { data: calls },
      { data: history },
      { data: fees },
    ] = await Promise.all([
      supabase
        .from("interview_bookings")
        .select("lead_id, round, outcome, scheduled_at, feedback_notes")
        .in("lead_id", chunk),
      supabase
        .from("call_logs")
        .select("lead_id, logged_at, outcome, duration, notes")
        .in("lead_id", chunk),
      supabase
        .from("stage_history")
        .select("lead_id, from_stage, to_stage, changed_at")
        .in("lead_id", chunk),
      supabase
        .from("fee_records")
        .select("lead_id, total_fee, remaining_fee, list_price, payment_mode")
        .in("lead_id", chunk),
    ]);

    for (const lead of leadChunk) {
      const f = (fees ?? []).find((x) => x.lead_id === lead.id);
      const signals = signalsFromClosedLead({
        source: lead.source,
        programme: lead.programme,
        years_experience: lead.years_experience,
        preferred_industry: lead.preferred_industry,
        course_id: lead.course_id,
        cohort_id: lead.cohort_id,
        created_at: lead.created_at,
        email: lead.email,
        linkedin: lead.linkedin,
        intent_score: lead.intent_score,
        bookings: (bookings ?? [])
          .filter((b) => b.lead_id === lead.id)
          .map((b) => ({
            round: b.round,
            outcome: b.outcome,
            scheduled_at: b.scheduled_at,
            feedback_notes: b.feedback_notes,
          })),
        calls: (calls ?? [])
          .filter((c) => c.lead_id === lead.id)
          .map((c) => ({
            logged_at: c.logged_at,
            outcome: c.outcome,
            duration: c.duration,
            notes: c.notes,
          })),
        history: (history ?? [])
          .filter((h) => h.lead_id === lead.id)
          .map((h) => ({
            from_stage: h.from_stage,
            to_stage: h.to_stage,
            changed_at: h.changed_at,
          })),
        fee: f
          ? {
              total_fee: Number(f.total_fee),
              remaining_fee: Number(f.remaining_fee),
              list_price: f.list_price != null ? Number(f.list_price) : null,
              payment_mode: f.payment_mode,
            }
          : null,
      });
      const { values } = featureVector(signals);
      rows.push({ x: values, y: lead.stage === "closed_won" ? 1 : 0 });
    }
  }

  if (rows.length < MIN_LABELS_FOR_FIT) return null;

  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rows[i], rows[j]] = [rows[j]!, rows[i]!];
  }
  const hold = Math.max(8, Math.floor(rows.length * 0.2));
  const test = rows.slice(0, hold);
  const train = rows.slice(hold);

  const { names } = featureVector({} as ScoreSignals);
  const weights = trainLogistic(
    train.map((r) => r.x),
    train.map((r) => r.y)
  );

  const auc = aucScore(
    test.map((r) => {
      let z = weights[0]!;
      for (let j = 0; j < r.x.length; j++) z += (weights[j + 1] ?? 0) * r.x[j]!;
      return { p: sigmoid(z), y: r.y };
    })
  );

  const model: LearnedConversionModel = {
    version: 1,
    fittedAt: new Date().toISOString(),
    nWon,
    nLost,
    nTotal: leads.length,
    featureNames: names,
    weights,
    baseRate: nWon / leads.length,
    auc,
  };

  await supabase.from("app_settings").upsert({
    key: CONVERSION_MODEL_KEY,
    value: model,
    updated_at: new Date().toISOString(),
  });

  return model;
}

export async function loadLearnedModel(
  supabase: SupabaseClient
): Promise<LearnedConversionModel | null> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", CONVERSION_MODEL_KEY)
    .maybeSingle();
  if (!data?.value || typeof data.value !== "object") return null;
  const m = data.value as LearnedConversionModel;
  if (m.version !== 1 || !Array.isArray(m.weights)) return null;
  return m;
}

export function empiricalBlendWeight(model: LearnedConversionModel | null): number {
  if (!model) return 0;
  const n = model.nTotal;
  let w = Math.min(0.55, Math.max(0, (n - 30) / 200) * 0.55);
  if (model.auc != null) {
    w *= Math.min(1.15, Math.max(0.5, (model.auc - 0.5) * 2));
  }
  return Math.min(0.6, w);
}
