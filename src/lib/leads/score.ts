import type { SupabaseClient } from "@supabase/supabase-js";
import type { Stage } from "@/lib/constants";

/**
 * Conversion likelihood — calibrated log-odds model.
 * Estimates P(lead becomes a student | evidence), with plain-language reasons.
 *
 * Design:
 * - Stage-conditional survival prior (P(enroll | current stage))
 * - Residual evidence in log-odds (avoids double-counting stage)
 * - Interaction terms + confidence-based shrinkage
 * - Optional blend with empirical logistic model once enough won/lost labels exist
 * - Sigmoid → probability 0–100
 */

export type ScoreReason = {
  effect: "up" | "down" | "info";
  pillar:
    | "prior"
    | "web"
    | "interest"
    | "engagement"
    | "fit"
    | "velocity"
    | "interview"
    | "offer"
    | "source"
    | "overall";
  text: string;
  /** Approximate percentage-point impact at current prior (for UI) */
  impactPts?: number;
};

export type ScoreBreakdown = {
  score: number;
  /** 0–100 how much evidence we had */
  confidence: number;
  pillars: {
    web: number;
    interest: number;
    engagement: number;
    fit: number;
    velocity: number;
    interview: number;
    offer: number;
    source: number;
  };
  reasons: ScoreReason[];
};

export type PageEventSignal = {
  event_type: string;
  page_url: string | null;
  element_label?: string | null;
  element_selector?: string | null;
  occurred_at: string;
};

export type ScoreSignals = {
  stage: Stage | string;
  source?: string | null;
  programme?: string | null;
  yearsExperience?: number | null;
  preferredIndustry?: string | null;
  courseId?: string | null;
  cohortId?: string | null;
  /** Days until cohort start (negative if started) */
  daysToCohortStart?: number | null;
  leadAgeDays?: number | null;
  hasEmail?: boolean;
  hasLinkedin?: boolean;
  formIntentPrior?: number | null;

  // Calls
  callCount?: number;
  connectedCalls?: number;
  callbackRequests?: number;
  dnpCalls?: number;
  wrongNumberCalls?: number;
  recentCallDays?: number | null;
  /** Hours from lead create → first call */
  hoursToFirstCall?: number | null;
  /** Max / avg talk time on connected calls (seconds) */
  maxCallDurationSec?: number | null;
  avgConnectedDurationSec?: number | null;
  /** NLP hits in call notes */
  callNoteInterestHits?: number;
  callNoteObjectionHits?: number;
  callNoteUrgencyHits?: number;

  // Interviews
  bookings?: {
    round: string;
    outcome: string | null;
    scheduled_at?: string | null;
    feedback_notes?: string | null;
  }[];

  // Stage history timings (days)
  daysToFirstR1?: number | null;
  daysInCurrentStage?: number | null;
  stageMoves?: number;
  regressions?: number;

  // Marketing web
  pageviews?: number;
  uniquePages?: number;
  maxScrollDepth?: number; // 0, 25, 50, 75, 100
  ctaClicks?: number;
  highIntentPageviews?: number;
  sessionDurationMin?: number | null;
  revisitDays?: number | null; // span first→last seen
  utmSource?: string | null;
  utmMedium?: string | null;
  campaignSourceType?: string | null; // paid_ad | organic | influencer

  // Offer / fee
  hasOfferFee?: boolean;
  feeDiscountPct?: number | null;
  paymentMode?: string | null;
  remainingFeeRatio?: number | null; // remaining/total
  hasPaidInstallment?: boolean;
};

// ─── math ───────────────────────────────────────────────────────────

function clamp(n: number, lo = 0, hi = 100) {
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

function logit(p: number) {
  const x = Math.min(0.99, Math.max(0.01, p));
  return Math.log(x / (1 - x));
}

function sigmoid(z: number) {
  return 1 / (1 + Math.exp(-z));
}

/** Rough %pt change from adding Δlog-odds at probability p */
function approxPts(p: number, dLogOdds: number) {
  const before = p;
  const after = sigmoid(logit(p) + dLogOdds);
  return Math.round((after - before) * 100);
}

type Evidence = {
  d: number;
  pillar: ScoreReason["pillar"];
  text: string;
  effect: ScoreReason["effect"];
};

// ─── lexicons ───────────────────────────────────────────────────────

const INTEREST_LEX =
  /\b(interested|excited|ready to join|want to join|will join|joining|confirmed|looking forward|yes i('m| am) in|sign me up|definitely|committed)\b/i;
const OBJECTION_LEX =
  /\b(expensive|can'?t afford|too costly|not sure|maybe later|next year|thinking|hesitat|competitor|another program|spouse|family opposed|budget|loan issue|no money)\b/i;
const URGENCY_LEX =
  /\b(this (month|cohort|batch)|asap|urgent|deadline|need to decide|starting soon|this week)\b/i;
const FEEDBACK_POS =
  /\b(strong|excellent|great fit|hire|recommend|impressive|clear communicator|motivated|high potential)\b/i;
const FEEDBACK_NEG =
  /\b(weak|not ready|poor|concern|red flag|reject|mismatch|unprepared|no show)\b/i;

const HIGH_INTENT_URL =
  /pgp|apply|#apply|admissions|fee|tuition|placement|curriculum|cohort|brochure|document|fellowship|executive|undergrad|\/ug/i;

function countLexHits(texts: (string | null | undefined)[], re: RegExp): number {
  let n = 0;
  for (const t of texts) {
    if (!t) continue;
    if (re.test(t)) n += 1;
  }
  return n;
}

function maxScrollFromEvents(events: PageEventSignal[]): number {
  let max = 0;
  for (const ev of events) {
    if (ev.event_type !== "scroll_depth") continue;
    const sel = ev.element_selector || "";
    if (sel.includes("100")) max = Math.max(max, 100);
    else if (sel.includes("75")) max = Math.max(max, 75);
    else if (sel.includes("50")) max = Math.max(max, 50);
    else if (sel.includes("25")) max = Math.max(max, 25);
  }
  return max;
}

function summarizeWeb(events: PageEventSignal[]): {
  pageviews: number;
  uniquePages: number;
  maxScrollDepth: number;
  ctaClicks: number;
  highIntentPageviews: number;
} {
  const urls = new Set<string>();
  let pageviews = 0;
  let ctaClicks = 0;
  let highIntentPageviews = 0;
  for (const ev of events) {
    const url = (ev.page_url || "").toLowerCase();
    if (ev.event_type === "pageview") {
      pageviews += 1;
      if (url) urls.add(url.split("?")[0]!);
      if (HIGH_INTENT_URL.test(url)) highIntentPageviews += 1;
    }
    if (ev.event_type === "click") {
      const label = `${ev.element_label || ""} ${ev.element_selector || ""}`.toLowerCase();
      if (
        /apply|enroll|submit|book|register|download|brochure|get started|start application/i.test(
          label
        ) ||
        HIGH_INTENT_URL.test(url)
      ) {
        ctaClicks += 1;
      }
    }
  }
  return {
    pageviews,
    uniquePages: urls.size,
    maxScrollDepth: maxScrollFromEvents(events),
    ctaClicks,
    highIntentPageviews,
  };
}

// ─── stage-conditional priors (admissions funnel survival rates) ─────
/** P(enroll | reached this stage) — industry-calibrated anchors. */
export function stageBaseRate(stage: string): number {
  const s = stage as Stage;
  const table: Partial<Record<Stage, number>> = {
    lead_created: 0.09,
    in_funnel: 0.1,
    new_lead: 0.11,
    call_logged_nurturing: 0.2,
    dnp: 0.05,
    no_show: 0.07,
    reschedule: 0.12,
    r1_booked: 0.3,
    r1_confirmed: 0.44,
    r1_reject: 0.04,
    r1_no_show: 0.11,
    r1_reschedule: 0.24,
    r2_booked: 0.5,
    r2_tbb: 0.46,
    r2_reject: 0.05,
    r2_no_show: 0.14,
    r2_reschedule: 0.4,
    r3_booked: 0.58,
    r3_tbb: 0.55,
    r3_no_show: 0.18,
    r3_reschedule: 0.48,
    yet_to_offer: 0.6,
    offered: 0.72,
    closed_won: 0.97,
    closed_lost: 0.04,
  };
  return table[s] ?? 0.12;
}

function stageRank(stage: string): number {
  const table: Record<string, number> = {
    lead_created: 0,
    in_funnel: 1,
    new_lead: 2,
    call_logged_nurturing: 3,
    dnp: 2,
    no_show: 2,
    reschedule: 2,
    r1_booked: 10,
    r1_confirmed: 12,
    r1_reject: 9,
    r1_no_show: 9,
    r1_reschedule: 10,
    r2_booked: 20,
    r2_tbb: 21,
    r2_reject: 19,
    r2_no_show: 19,
    r2_reschedule: 20,
    r3_booked: 30,
    r3_tbb: 31,
    r3_no_show: 29,
    r3_reschedule: 30,
    yet_to_offer: 40,
    offered: 50,
    closed_won: 60,
    closed_lost: -1,
  };
  return table[stage] ?? 2;
}

function connectRateSafe(s: ScoreSignals) {
  const calls = Math.max(1, s.callCount ?? 0);
  return (s.connectedCalls ?? 0) / calls;
}

/**
 * Full conversion likelihood with:
 * - stage-conditional base rate (survival prior)
 * - residual log-odds evidence (no double-counting stage)
 * - interaction terms
 * - optional empirical model blend (when enough won/lost history exists)
 * - shrinkage when evidence is thin
 */
export function computeConversionLikelihood(
  signals: ScoreSignals,
  opts?: {
    learnedLogit?: number | null;
    learnedBlendWeight?: number;
    learnedMeta?: { nTotal: number; auc: number | null } | null;
  }
): ScoreBreakdown {
  const stage = signals.stage as Stage;
  const evidence: Evidence[] = [];
  const rank = stageRank(stage);
  const base = stageBaseRate(stage);
  let z = logit(base);
  let pCursor = base;

  const push = (d: number, pillar: ScoreReason["pillar"], text: string) => {
    if (Math.abs(d) < 0.01) return;
    const effect: ScoreReason["effect"] = d > 0.02 ? "up" : d < -0.02 ? "down" : "info";
    evidence.push({ d, pillar, text, effect });
    z += d;
    pCursor = sigmoid(z);
  };

  if (stage === "closed_won") {
    return {
      score: 97,
      confidence: 100,
      pillars: {
        web: 70,
        interest: 95,
        engagement: 90,
        fit: 80,
        velocity: 90,
        interview: 95,
        offer: 95,
        source: 60,
      },
      reasons: [
        {
          effect: "up",
          pillar: "overall",
          text: "Already converted (closed won)",
          impactPts: 80,
        },
      ],
    };
  }
  if (stage === "closed_lost") {
    return {
      score: 5,
      confidence: 100,
      pillars: {
        web: 30,
        interest: 8,
        engagement: 15,
        fit: 40,
        velocity: 20,
        interview: 10,
        offer: 5,
        source: 40,
      },
      reasons: [
        {
          effect: "down",
          pillar: "overall",
          text: "Closed lost",
          impactPts: -70,
        },
      ],
    };
  }

  evidence.push({
    d: 0,
    pillar: "prior",
    text: `Stage prior ${Math.round(base * 100)}% for “${String(stage).replace(/_/g, " ")}” (funnel survival rate)`,
    effect: "info",
  });

  if (signals.formIntentPrior != null && !Number.isNaN(signals.formIntentPrior)) {
    const prior = Math.min(100, Math.max(0, signals.formIntentPrior)) / 100;
    const d = (logit(prior) - logit(base)) * 0.35;
    push(
      d,
      "interest",
      `Form interest prior ${Math.round(prior * 100)}% vs stage base (partial trust)`
    );
  }

  const src = (signals.source || "").toLowerCase();
  const camp = (signals.campaignSourceType || "").toLowerCase();
  if (src.includes("referral") || src.includes("alumni")) {
    push(0.55, "source", "Referral / alumni — higher historical enroll rate");
  } else if (/website:pgp|pgp/.test(src) || (signals.programme || "").toLowerCase().includes("pgp")) {
    push(0.28, "source", "PGP / core programme intake");
  } else if (src.includes("placement")) {
    push(0.32, "source", "Placements-content path — career-motivated");
  } else if (src.includes("organic") || src.includes("inbound") || /^website/.test(src)) {
    push(0.18, "source", "Inbound / website self-directed interest");
  } else if (camp === "organic") {
    push(0.12, "source", "Organic campaign match");
  } else if (camp === "paid_ad" || /meta|google|paid|ads/.test(src)) {
    push(-0.2, "source", "Paid acquisition — lower average enroll rate");
  }
  if (signals.utmMedium?.toLowerCase().includes("cpc")) {
    push(-0.1, "source", "UTM CPC — colder paid click");
  }

  const pv = signals.pageviews ?? 0;
  const hi = signals.highIntentPageviews ?? 0;
  const scroll = signals.maxScrollDepth ?? 0;
  const cta = signals.ctaClicks ?? 0;
  const uniq = signals.uniquePages ?? 0;
  const sessMin = signals.sessionDurationMin ?? null;
  const hasWeb = pv > 0 || scroll > 0 || cta > 0;

  if (!hasWeb) {
    evidence.push({
      d: 0,
      pillar: "web",
      text: "No tracked web session — web evidence unavailable",
      effect: "info",
    });
  } else {
    if (pv >= 8) push(0.32, "web", `${pv} pageviews — deep research`);
    else if (pv >= 4) push(0.18, "web", `${pv} pageviews`);
    else if (pv >= 2) push(0.08, "web", `${pv} pageviews`);
    if (uniq >= 5) push(0.15, "web", `${uniq} distinct pages`);
    if (hi >= 3) push(0.38, "web", `${hi} high-intent pages (apply/fees/PGP/placements)`);
    else if (hi >= 1) push(0.16, "web", `${hi} high-intent page visit(s)`);
    if (scroll >= 100) push(0.25, "web", "Scrolled to 100%");
    else if (scroll >= 75) push(0.15, "web", "Scrolled to 75%+");
    else if (scroll >= 50) push(0.06, "web", "Scrolled to 50%");
    if (cta >= 2) push(0.32, "web", `${cta} apply/CTA clicks`);
    else if (cta === 1) push(0.16, "web", "Clicked apply/CTA");
    if (sessMin != null) {
      if (sessMin >= 12) push(0.22, "web", `~${Math.round(sessMin)} min on site`);
      else if (sessMin >= 5) push(0.1, "web", `~${Math.round(sessMin)} min on site`);
      else if (sessMin < 1 && pv <= 2) push(-0.12, "web", "Very short session");
    }
    if ((signals.revisitDays ?? 0) >= 2) {
      push(0.2, "web", `Returned across ${signals.revisitDays} days`);
    }
  }

  if (signals.courseId) push(0.14, "fit", "Course assigned");
  if (signals.cohortId) push(0.14, "fit", "Cohort assigned");
  if (signals.preferredIndustry?.trim()) {
    push(0.1, "fit", `Preferred industry: ${signals.preferredIndustry.trim()}`);
  }
  if (signals.hasEmail) push(0.06, "fit", "Email on file");
  if (signals.hasLinkedin) push(0.08, "fit", "LinkedIn on file");
  if (signals.yearsExperience != null) {
    const y = signals.yearsExperience;
    if (y >= 2 && y <= 8) push(0.28, "fit", `${y}y experience — strong ICP`);
    else if (y > 0 && y < 2) push(0.1, "fit", `${y}y experience — early career`);
    else if (y > 8 && y <= 12) push(0.12, "fit", `${y}y experience — senior`);
    else if (y > 12) push(-0.06, "fit", `${y}y experience — outside typical ICP`);
  }
  if (signals.daysToCohortStart != null) {
    const d = signals.daysToCohortStart;
    if (d >= 0 && d <= 21) push(0.22, "fit", `Cohort starts in ${d}d — urgency`);
    else if (d > 21 && d <= 60) push(0.08, "fit", `Cohort starts in ${d}d`);
    else if (d < 0) push(-0.14, "fit", "Cohort start already passed");
  }

  const calls = signals.callCount ?? 0;
  const connected = signals.connectedCalls ?? 0;
  const callbacks = signals.callbackRequests ?? 0;
  const dnp = signals.dnpCalls ?? 0;
  const wrong = signals.wrongNumberCalls ?? 0;

  if (calls === 0) {
    if (rank < 10) push(-0.18, "engagement", "No calls logged yet");
  } else {
    const connectRate = connected / Math.max(1, calls);
    if (connectRate >= 0.5 && connected >= 2) {
      push(0.4, "engagement", `Strong connect rate (${connected}/${calls})`);
    } else if (connected >= 1) {
      push(0.2, "engagement", `${connected} connected call(s)`);
    } else if (rank < 10) {
      push(-0.15, "engagement", "Calls attempted but none connected");
    }
    if (callbacks >= 1) push(0.28, "engagement", "Callback requested — reciprocal engagement");
    if (dnp >= 3) push(-0.42, "engagement", `${dnp} DNPs — hard to reach`);
    else if (dnp >= 2) push(-0.22, "engagement", `${dnp} DNPs`);
    if (wrong >= 1) push(-0.55, "engagement", "Wrong number on file");
  }

  if (signals.hoursToFirstCall != null) {
    const h = signals.hoursToFirstCall;
    if (h <= 4) push(0.25, "velocity", `First call within ${Math.max(1, Math.round(h))}h`);
    else if (h <= 24) push(0.12, "velocity", "First call within 24h");
    else if (h > 72) push(-0.18, "velocity", `First call took ~${Math.round(h / 24)}d`);
  }

  if (signals.recentCallDays != null) {
    const d = signals.recentCallDays;
    if (d <= 2) push(0.3, "engagement", `Last touch ${d === 0 ? "today" : `${d}d ago`}`);
    else if (d <= 7) push(0.12, "engagement", `Last touch ${d}d ago`);
    else if (d > 21) push(-0.38, "engagement", `No contact for ${d}d`);
    else if (d > 14) push(-0.18, "engagement", `Last touch ${d}d ago`);
  } else if ((signals.leadAgeDays ?? 0) > 14 && calls === 0) {
    push(-0.3, "engagement", `Lead ${signals.leadAgeDays}d old with zero calls`);
  }

  if ((signals.maxCallDurationSec ?? 0) >= 300) {
    push(0.38, "interest", `Long call ${Math.round((signals.maxCallDurationSec || 0) / 60)}+ min`);
  } else if ((signals.maxCallDurationSec ?? 0) >= 120) {
    push(0.18, "interest", `Connected call ~${Math.round((signals.maxCallDurationSec || 0) / 60)} min`);
  }

  const noteInterest = signals.callNoteInterestHits ?? 0;
  const noteObj = signals.callNoteObjectionHits ?? 0;
  const noteUrg = signals.callNoteUrgencyHits ?? 0;
  if (noteInterest > 0) {
    push(
      0.35 + Math.min(0.2, (noteInterest - 1) * 0.08),
      "interest",
      `Call notes show join interest (${noteInterest})`
    );
  }
  if (noteObj > 0) {
    push(
      -0.32 - Math.min(0.2, (noteObj - 1) * 0.08),
      "interest",
      `Call notes show objections (${noteObj})`
    );
  }
  if (noteUrg > 0) push(0.22, "interest", "Call notes mention urgency / timeline");

  if (stage === "dnp" || stage === "no_show") {
    push(-0.15, "interest", "Reachability / show-up risk beyond stage prior");
  }

  if (signals.daysToFirstR1 != null) {
    const d = signals.daysToFirstR1;
    if (d <= 3) push(0.28, "velocity", `R1 in ${d}d — faster than typical`);
    else if (d <= 7) push(0.12, "velocity", `R1 in ${d}d — healthy pace`);
    else if (d > 14) push(-0.22, "velocity", `R1 took ${d}d — slow vs typical`);
  }
  if ((signals.regressions ?? 0) >= 2) push(-0.28, "velocity", `${signals.regressions} stage regressions`);
  else if ((signals.regressions ?? 0) === 1) push(-0.1, "velocity", "One stage regression");
  if ((signals.daysInCurrentStage ?? 0) >= 21 && rank < 50) {
    push(-0.22, "velocity", `Stuck ${signals.daysInCurrentStage}d in current stage`);
  }

  const age = signals.leadAgeDays ?? 0;
  const recent = signals.recentCallDays != null && signals.recentCallDays <= 7;
  if (age > 45 && !recent && rank < 50) push(-0.28, "velocity", `Age ${age}d without recent contact`);
  else if (age > 30 && !recent && rank < 40) push(-0.14, "velocity", `Age ${age}d without recent contact`);

  const bookings = signals.bookings ?? [];
  const rounds = new Set(bookings.map((b) => b.round));
  const confirmed = bookings.filter((b) => b.outcome === "confirmed").length;
  const reject = bookings.filter((b) => b.outcome === "reject").length;
  const tbb = bookings.filter((b) => b.outcome === "tbb").length;

  if (bookings.length === 0 && rank < 10 && (signals.leadAgeDays ?? 0) > 10 && calls >= 2) {
    push(-0.14, "interview", "Calls happening but no interview booked");
  }
  if (rounds.has("R1") && rank < 10) push(0.22, "interview", "R1 booked (ahead of stage signal)");
  if (rounds.has("R2") && rank < 20) push(0.3, "interview", "R2 reached (ahead of stage)");
  if (rounds.has("R3") && rank < 30) push(0.32, "interview", "R3 reached (ahead of stage)");

  if (confirmed > 0) {
    if (confirmed >= 2) push(0.35, "interview", `Selected in ${confirmed} rounds`);
    else if (rank < 12) push(0.28, "interview", "Selected / confirmed in interview");
    else push(0.1, "interview", "Interview selection quality");
  }
  if (tbb > 0 && rank < 40) push(0.08, "interview", "TBB — still in play");
  if (reject > 0) {
    push(-0.55 - Math.min(0.35, (reject - 1) * 0.2), "interview", `Rejected in ${reject} round(s)`);
  }

  const fbPos = countLexHits(
    bookings.map((b) => b.feedback_notes),
    FEEDBACK_POS
  );
  const fbNeg = countLexHits(
    bookings.map((b) => b.feedback_notes),
    FEEDBACK_NEG
  );
  if (fbPos > 0) push(0.38, "interview", "Interviewer feedback positive / strong fit");
  if (fbNeg > 0) push(-0.42, "interview", "Interviewer feedback raises concerns");

  if (signals.hasOfferFee) {
    if (rank < 50) push(0.45, "offer", "Offer fee set — commercial commitment");
    else push(0.15, "offer", "Offer fee on file");
    if (signals.feeDiscountPct != null && signals.feeDiscountPct >= 15) {
      push(0.08, "offer", `${Math.round(signals.feeDiscountPct)}% discount vs list`);
    }
    if (signals.paymentMode === "loan") push(-0.1, "offer", "Loan mode — higher melt risk");
    else if (signals.paymentMode === "direct_instalments") push(0.1, "offer", "Direct installments");
    if (signals.hasPaidInstallment) push(0.85, "offer", "Payment received — very high likelihood");
    else if ((signals.remainingFeeRatio ?? 1) >= 0.99 && rank >= 50) {
      push(-0.12, "offer", "Offer set but nothing paid yet");
    }
  }

  // Interactions
  if (hasWeb && hi >= 2 && connected >= 1) {
    push(0.22, "interest", "Interaction: deep web research + connected call");
  }
  if (noteInterest > 0 && (rounds.has("R1") || rank >= 10)) {
    push(0.18, "interest", "Interaction: verbal interest + interview path");
  }
  if (noteObj > 0 && !signals.hasOfferFee && rank >= 40) {
    push(-0.2, "interest", "Interaction: objections at late stage without fee set");
  }
  if ((signals.revisitDays ?? 0) >= 2 && cta >= 1) {
    push(0.14, "web", "Interaction: multi-day return + CTA click");
  }
  if (connectRateSafe(signals) >= 0.5 && (signals.maxCallDurationSec ?? 0) >= 180) {
    push(0.16, "engagement", "Interaction: high connect rate + long conversations");
  }
  if (dnp >= 2 && (signals.leadAgeDays ?? 0) > 10 && rank < 10) {
    push(-0.16, "engagement", "Interaction: repeated DNP early in funnel");
  }

  const wEmp = opts?.learnedBlendWeight ?? 0;
  const zEmp = opts?.learnedLogit;
  let empiricNote: string | null = null;
  if (wEmp > 0.05 && zEmp != null && Number.isFinite(zEmp)) {
    const before = sigmoid(z);
    z = (1 - wEmp) * z + wEmp * zEmp;
    pCursor = sigmoid(z);
    const meta = opts?.learnedMeta;
    empiricNote = `Blended ${Math.round(wEmp * 100)}% empirical model${
      meta ? ` (n=${meta.nTotal} closed${meta.auc != null ? `, AUC ${meta.auc.toFixed(2)}` : ""})` : ""
    } → ${Math.round(before * 100)}%→${Math.round(pCursor * 100)}%`;
  }

  let score = clamp(sigmoid(z) * 100);

  const pillarZ: Record<string, number> = {
    web: 0,
    interest: 0,
    engagement: 0,
    fit: 0,
    velocity: 0,
    interview: 0,
    offer: 0,
    source: 0,
  };
  for (const e of evidence) {
    if (e.pillar in pillarZ) pillarZ[e.pillar]! += e.d;
  }
  const pillarScore = (dz: number) => clamp(sigmoid(logit(0.45) + dz) * 100);
  const pillarsHit = Object.values(pillarZ).filter((v) => Math.abs(v) > 0.05).length;
  const evidenceN = evidence.filter((e) => e.d !== 0).length;
  const confidence = clamp(
    30 +
      pillarsHit * 7 +
      Math.min(25, evidenceN * 2.5) +
      (hasWeb ? 8 : 0) +
      (calls > 0 ? 8 : 0) +
      (bookings.length > 0 ? 6 : 0) +
      (signals.hasOfferFee ? 5 : 0) +
      (wEmp > 0.05 ? 5 : 0)
  );

  const shrink = 1 - confidence / 100;
  if (shrink > 0.15 && !signals.hasPaidInstallment) {
    const shrunk = sigmoid((1 - shrink * 0.55) * z + shrink * 0.55 * logit(base));
    score = clamp(shrunk * 100);
  }

  if (stage === "offered" && score < 55) score = 55;
  if (confirmed >= 2 && score < 50) score = 50;
  if (!signals.hasPaidInstallment && score > 93) score = 93;
  if (signals.hasPaidInstallment) score = Math.max(score, 90);

  let pWalk = base;
  const reasons: ScoreReason[] = [
    {
      effect: "info",
      pillar: "overall",
      text: `Model estimate: ${score}% chance of becoming a student (confidence ${confidence}%)`,
    },
  ];
  for (const e of evidence) {
    const pts = e.d === 0 ? undefined : approxPts(pWalk, e.d);
    if (e.d !== 0) pWalk = sigmoid(logit(pWalk) + e.d);
    reasons.push({
      effect: e.effect,
      pillar: e.pillar,
      text: pts != null && pts !== 0 ? `${e.text} (~${pts > 0 ? "+" : ""}${pts} pts)` : e.text,
      impactPts: pts,
    });
  }
  if (empiricNote) {
    reasons.push({ effect: "info", pillar: "overall", text: empiricNote });
  }

  const headline = reasons[0]!;
  const rest = reasons
    .slice(1)
    .sort((a, b) => Math.abs(b.impactPts ?? 0) - Math.abs(a.impactPts ?? 0));

  return {
    score,
    confidence,
    pillars: {
      web: pillarScore(pillarZ.web!),
      interest: pillarScore(pillarZ.interest!),
      engagement: pillarScore(pillarZ.engagement!),
      fit: pillarScore(pillarZ.fit!),
      velocity: pillarScore(pillarZ.velocity!),
      interview: pillarScore(pillarZ.interview!),
      offer: pillarScore(pillarZ.offer!),
      source: pillarScore(pillarZ.source!),
    },
    reasons: [headline, ...rest],
  };
}


export function computeAutoScore(signals: ScoreSignals): number {
  return computeConversionLikelihood(signals).score;
}

export function effectiveScore(opts: {
  scoreAuto: number | null | undefined;
  scoreOverride: number | null | undefined;
  intentScore?: number | null | undefined;
}): number | null {
  if (opts.scoreOverride != null) return opts.scoreOverride;
  if (opts.scoreAuto != null) return opts.scoreAuto;
  if (opts.intentScore != null) return opts.intentScore;
  return null;
}

// ─── signal builders ────────────────────────────────────────────────

function daysBetween(a: string, b: string) {
  return (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24);
}

function classifyCallOutcome(outcome: string | null | undefined): "pos" | "neg" | "neu" | "dnp" | "wrong" | "callback" {
  if (!outcome) return "neu";
  const o = outcome.toLowerCase();
  if (o === "wrong_number") return "wrong";
  if (o === "dnp") return "dnp";
  if (o === "callback_requested") return "callback";
  if (o === "connected") return "pos";
  return "neu";
}

export function buildScoreSignals(input: {
  stage: string;
  source?: string | null;
  programme?: string | null;
  yearsExperience?: number | null;
  preferredIndustry?: string | null;
  courseId?: string | null;
  cohortId?: string | null;
  cohortStartDate?: string | null;
  createdAt?: string | null;
  email?: string | null;
  linkedin?: string | null;
  formIntentPrior?: number | null;
  scoreAuto?: number | null;
  intentScore?: number | null;
  bookings?: {
    round: string;
    outcome: string | null;
    scheduled_at?: string | null;
    feedback_notes?: string | null;
  }[];
  calls?: {
    logged_at: string;
    outcome?: string | null;
    duration?: number | null;
    notes?: string | null;
  }[];
  stageHistory?: { from_stage: string | null; to_stage: string; changed_at: string }[];
  pageEvents?: PageEventSignal[];
  session?: {
    first_seen_at?: string | null;
    last_seen_at?: string | null;
    utm_source?: string | null;
    utm_medium?: string | null;
  } | null;
  campaignSourceType?: string | null;
  fee?: {
    total_fee: number;
    remaining_fee: number;
    list_price?: number | null;
    payment_mode?: string | null;
  } | null;
  hasPaidInstallment?: boolean;
}): ScoreSignals {
  const createdAt = input.createdAt ?? null;
  const calls = [...(input.calls ?? [])].sort(
    (a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime()
  );

  let connectedCalls = 0;
  let callbackRequests = 0;
  let dnpCalls = 0;
  let wrongNumberCalls = 0;
  const connectedDurations: number[] = [];
  for (const c of calls) {
    const kind = classifyCallOutcome(c.outcome);
    if (kind === "pos") {
      connectedCalls += 1;
      if (c.duration != null && c.duration > 0) connectedDurations.push(c.duration);
    }
    if (kind === "callback") callbackRequests += 1;
    if (kind === "dnp") dnpCalls += 1;
    if (kind === "wrong") wrongNumberCalls += 1;
  }

  let recentCallDays: number | null = null;
  if (calls[0]?.logged_at) {
    recentCallDays = Math.floor(
      (Date.now() - new Date(calls[0].logged_at).getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  let hoursToFirstCall: number | null = null;
  if (createdAt && calls.length) {
    const first = [...calls].sort(
      (a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime()
    )[0]!;
    hoursToFirstCall =
      (new Date(first.logged_at).getTime() - new Date(createdAt).getTime()) /
      (1000 * 60 * 60);
    if (hoursToFirstCall < 0) hoursToFirstCall = 0;
  }

  const leadAgeDays = createdAt
    ? Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const formIntentPrior =
    input.formIntentPrior != null
      ? input.formIntentPrior
      : input.scoreAuto == null && input.intentScore != null
        ? input.intentScore
        : null;

  const history = [...(input.stageHistory ?? [])].sort(
    (a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime()
  );
  let daysToFirstR1: number | null = null;
  let regressions = 0;
  const STAGE_RANK: Record<string, number> = {
    lead_created: 0,
    in_funnel: 1,
    new_lead: 2,
    call_logged_nurturing: 3,
    r1_booked: 10,
    r1_confirmed: 11,
    r2_booked: 20,
    r2_tbb: 21,
    r3_booked: 30,
    r3_tbb: 31,
    yet_to_offer: 40,
    offered: 50,
    closed_won: 60,
    closed_lost: -1,
  };
  for (const h of history) {
    if (daysToFirstR1 == null && /r1_booked|r1_confirmed/.test(h.to_stage) && createdAt) {
      daysToFirstR1 = Math.max(0, Math.round(daysBetween(createdAt, h.changed_at)));
    }
    if (h.from_stage && STAGE_RANK[h.from_stage] != null && STAGE_RANK[h.to_stage] != null) {
      if ((STAGE_RANK[h.to_stage] ?? 0) >= 0 && (STAGE_RANK[h.from_stage] ?? 0) > (STAGE_RANK[h.to_stage] ?? 0)) {
        regressions += 1;
      }
    }
  }
  const lastHist = history[history.length - 1];
  const daysInCurrentStage = lastHist
    ? Math.floor(
        (Date.now() - new Date(lastHist.changed_at).getTime()) / (1000 * 60 * 60 * 24)
      )
    : null;

  const web = summarizeWeb(input.pageEvents ?? []);
  let sessionDurationMin: number | null = null;
  let revisitDays: number | null = null;
  if (input.session?.first_seen_at && input.session?.last_seen_at) {
    const ms =
      new Date(input.session.last_seen_at).getTime() -
      new Date(input.session.first_seen_at).getTime();
    const days = Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
    if (days >= 1) {
      // Multi-day cookie span — treat as revisits, not one marathon session
      revisitDays = days;
      sessionDurationMin = null;
    } else {
      sessionDurationMin = Math.max(0, Math.min(180, ms / 60000)); // cap 3h
      revisitDays = 0;
    }
  }

  let daysToCohortStart: number | null = null;
  if (input.cohortStartDate) {
    daysToCohortStart = Math.round(
      (new Date(input.cohortStartDate + "T12:00:00").getTime() - Date.now()) /
        (1000 * 60 * 60 * 24)
    );
  }

  let feeDiscountPct: number | null = null;
  let remainingFeeRatio: number | null = null;
  if (input.fee && input.fee.total_fee > 0) {
    remainingFeeRatio = input.fee.remaining_fee / input.fee.total_fee;
    if (input.fee.list_price != null && input.fee.list_price > 0) {
      feeDiscountPct =
        ((input.fee.list_price - input.fee.total_fee) / input.fee.list_price) * 100;
    }
  }

  const noteTexts = calls.map((c) => c.notes);
  const maxCallDurationSec =
    connectedDurations.length > 0 ? Math.max(...connectedDurations) : null;
  const avgConnectedDurationSec =
    connectedDurations.length > 0
      ? connectedDurations.reduce((a, b) => a + b, 0) / connectedDurations.length
      : null;

  return {
    stage: input.stage,
    source: input.source,
    programme: input.programme,
    yearsExperience: input.yearsExperience,
    preferredIndustry: input.preferredIndustry,
    courseId: input.courseId,
    cohortId: input.cohortId,
    daysToCohortStart,
    leadAgeDays,
    hasEmail: Boolean(input.email?.trim()),
    hasLinkedin: Boolean(input.linkedin?.trim()),
    formIntentPrior,
    callCount: calls.length,
    connectedCalls,
    callbackRequests,
    dnpCalls,
    wrongNumberCalls,
    recentCallDays,
    hoursToFirstCall,
    maxCallDurationSec,
    avgConnectedDurationSec,
    callNoteInterestHits: countLexHits(noteTexts, INTEREST_LEX),
    callNoteObjectionHits: countLexHits(noteTexts, OBJECTION_LEX),
    callNoteUrgencyHits: countLexHits(noteTexts, URGENCY_LEX),
    bookings: input.bookings ?? [],
    daysToFirstR1,
    daysInCurrentStage,
    stageMoves: history.length,
    regressions,
    pageviews: web.pageviews,
    uniquePages: web.uniquePages,
    maxScrollDepth: web.maxScrollDepth,
    ctaClicks: web.ctaClicks,
    highIntentPageviews: web.highIntentPageviews,
    sessionDurationMin,
    revisitDays,
    utmSource: input.session?.utm_source ?? null,
    utmMedium: input.session?.utm_medium ?? null,
    campaignSourceType: input.campaignSourceType ?? null,
    hasOfferFee: Boolean(input.fee && input.fee.total_fee > 0),
    feeDiscountPct,
    paymentMode: input.fee?.payment_mode ?? null,
    remainingFeeRatio,
    hasPaidInstallment: Boolean(input.hasPaidInstallment),
  };
}

async function loadScoreContext(supabase: SupabaseClient, leadId: string) {
  const { data: lead } = await supabase
    .from("leads")
    .select(
      "id, stage, source, programme, years_experience, preferred_industry, course_id, cohort_id, created_at, email, linkedin, intent_score, score_auto, score_override, website_session_id"
    )
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return null;

  const [
    { data: bookings },
    { data: calls },
    { data: history },
    { data: attribution },
    { data: fee },
    { data: cohort },
  ] = await Promise.all([
    supabase
      .from("interview_bookings")
      .select("round, outcome, scheduled_at, feedback_notes")
      .eq("lead_id", leadId),
    supabase
      .from("call_logs")
      .select("logged_at, outcome, duration, notes")
      .eq("lead_id", leadId)
      .order("logged_at", { ascending: false })
      .limit(80),
    supabase
      .from("stage_history")
      .select("from_stage, to_stage, changed_at")
      .eq("lead_id", leadId)
      .order("changed_at", { ascending: true }),
    supabase
      .from("lead_attribution")
      .select("session_id, first_touch_campaign_id, last_touch_campaign_id")
      .eq("lead_id", leadId)
      .maybeSingle(),
    supabase
      .from("fee_records")
      .select("id, total_fee, remaining_fee, list_price, payment_mode")
      .eq("lead_id", leadId)
      .maybeSingle(),
    lead.cohort_id
      ? supabase.from("cohorts").select("start_date").eq("id", lead.cohort_id).maybeSingle()
      : Promise.resolve({ data: null as { start_date: string | null } | null }),
  ]);

  const sessionId = lead.website_session_id || attribution?.session_id || null;

  let pageEvents: PageEventSignal[] = [];
  let session: {
    first_seen_at?: string | null;
    last_seen_at?: string | null;
    utm_source?: string | null;
    utm_medium?: string | null;
    matched_campaign_id?: string | null;
  } | null = null;
  let campaignSourceType: string | null = null;

  if (sessionId) {
    const [{ data: events }, { data: sess }] = await Promise.all([
      supabase
        .from("page_events")
        .select("event_type, page_url, element_label, element_selector, occurred_at")
        .eq("session_id", sessionId)
        .order("occurred_at", { ascending: true })
        .limit(500),
      supabase
        .from("visitor_sessions")
        .select(
          "first_seen_at, last_seen_at, utm_source, utm_medium, matched_campaign_id"
        )
        .eq("id", sessionId)
        .maybeSingle(),
    ]);
    pageEvents = (events ?? []) as PageEventSignal[];
    session = sess;
  }

  const campaignId =
    session?.matched_campaign_id ||
    attribution?.last_touch_campaign_id ||
    attribution?.first_touch_campaign_id ||
    null;
  if (campaignId) {
    const { data: camp } = await supabase
      .from("campaigns")
      .select("source_type")
      .eq("id", campaignId)
      .maybeSingle();
    campaignSourceType = (camp?.source_type as string) ?? null;
  }

  let hasPaidInstallment = false;
  if (fee?.id) {
    const { data: inst } = await supabase
      .from("installments")
      .select("id, amount_realised, paid_at, status")
      .eq("fee_record_id", fee.id)
      .limit(20);
    hasPaidInstallment = (inst ?? []).some(
      (i) =>
        (i.paid_at != null && Number(i.amount_realised) > 0) ||
        i.status === "paid" ||
        Number(i.amount_realised) > 0
    );
  }

  return {
    lead,
    bookings: bookings ?? [],
    calls: calls ?? [],
    history: history ?? [],
    pageEvents,
    session,
    campaignSourceType,
    fee: fee
      ? {
          total_fee: Number(fee.total_fee),
          remaining_fee: Number(fee.remaining_fee),
          list_price: fee.list_price != null ? Number(fee.list_price) : null,
          payment_mode: fee.payment_mode as string | null,
        }
      : null,
    hasPaidInstallment,
    cohortStartDate: cohort?.start_date ?? null,
  };
}

function signalsFromContext(
  ctx: NonNullable<Awaited<ReturnType<typeof loadScoreContext>>>
) {
  return buildScoreSignals({
    stage: ctx.lead.stage,
    source: ctx.lead.source,
    programme: ctx.lead.programme,
    yearsExperience: ctx.lead.years_experience,
    preferredIndustry: ctx.lead.preferred_industry,
    courseId: ctx.lead.course_id,
    cohortId: ctx.lead.cohort_id,
    cohortStartDate: ctx.cohortStartDate,
    createdAt: ctx.lead.created_at,
    email: ctx.lead.email,
    linkedin: ctx.lead.linkedin,
    scoreAuto: ctx.lead.score_auto,
    intentScore: ctx.lead.intent_score,
    bookings: ctx.bookings,
    calls: ctx.calls,
    stageHistory: ctx.history,
    pageEvents: ctx.pageEvents,
    session: ctx.session,
    campaignSourceType: ctx.campaignSourceType,
    fee: ctx.fee,
    hasPaidInstallment: ctx.hasPaidInstallment,
  });
}

async function learnedOptsFor(
  supabase: SupabaseClient,
  signals: ScoreSignals
): Promise<{
  learnedLogit?: number | null;
  learnedBlendWeight?: number;
  learnedMeta?: { nTotal: number; auc: number | null } | null;
}> {
  try {
    const { loadLearnedModel, predictLearnedLogit, empiricalBlendWeight } = await import(
      "@/lib/leads/score-learn"
    );
    const learned = await loadLearnedModel(supabase);
    if (!learned) return {};
    return {
      learnedLogit: predictLearnedLogit(learned, signals),
      learnedBlendWeight: empiricalBlendWeight(learned),
      learnedMeta: { nTotal: learned.nTotal, auc: learned.auc },
    };
  } catch {
    return {};
  }
}

/** Load all signals and write score_auto + reasons + effective intent_score. */
export async function recomputeLeadScore(
  supabase: SupabaseClient,
  leadId: string
): Promise<number | null> {
  const ctx = await loadScoreContext(supabase, leadId);
  if (!ctx) return null;

  const signals = signalsFromContext(ctx);
  const breakdown = computeConversionLikelihood(signals, await learnedOptsFor(supabase, signals));
  const effective =
    ctx.lead.score_override != null ? Number(ctx.lead.score_override) : breakdown.score;

  const payload: Record<string, unknown> = {
    score_auto: breakdown.score,
    intent_score: effective,
    score_auto_reasons: breakdown.reasons,
  };

  const { error } = await supabase.from("leads").update(payload).eq("id", leadId);
  if (error && /score_auto_reasons/i.test(error.message)) {
    await supabase
      .from("leads")
      .update({
        score_auto: breakdown.score,
        intent_score: effective,
      })
      .eq("id", leadId);
  }

  return effective;
}

export async function explainLeadScore(
  supabase: SupabaseClient,
  leadId: string
): Promise<ScoreBreakdown | null> {
  const ctx = await loadScoreContext(supabase, leadId);
  if (!ctx) return null;
  const signals = signalsFromContext(ctx);
  return computeConversionLikelihood(signals, await learnedOptsFor(supabase, signals));
}
