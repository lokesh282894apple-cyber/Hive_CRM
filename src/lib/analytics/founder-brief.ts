import type { AdmissionsAnalytics } from "@/lib/analytics/admissions";

export type InsightSeverity = "critical" | "watch" | "good";

export type FounderInsight = {
  id: string;
  severity: InsightSeverity;
  title: string;
  detail: string;
  tweak: string;
  href?: string;
};

export type FounderProjection = {
  label: string;
  value: string;
  hint: string;
};

export type FounderBrief = {
  headline: string;
  narrative: string;
  projections: FounderProjection[];
  insights: FounderInsight[];
  confidence: "low" | "medium" | "high";
};

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function fmtInt(n: number) {
  return Math.round(n).toLocaleString("en-IN");
}

function fmtMoney(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Founder-facing projections + prioritized tweaks from live admissions analytics.
 * Heuristic (not ML): uses recent velocity, historical win rate, and fee averages.
 */
export function buildFounderBrief(data: AdmissionsAnalytics): FounderBrief {
  const { kpis, daily, counselorBoard, sourceMix, vendorLoanStats, paymentModeMix } = data;
  const days = Math.max(1, data.rangeDays);

  const leadsInRange = daily.reduce((s, d) => s + d.leads, 0);
  const wonInRange = daily.reduce((s, d) => s + d.won, 0);
  const callsInRange = kpis.callsInRange;
  const leadsPerDay = leadsInRange / days;
  const sessionsPerDay = kpis.sessionsInRange / days;
  const formConvRate =
    kpis.sessionsInRange > 0
      ? kpis.formConversionsInRange / kpis.sessionsInRange
      : 0;

  const winRateFrac = kpis.winRate > 0 ? kpis.winRate / 100 : 0;
  const closed = kpis.won + kpis.lost;

  // Avg ticket from fee books (total fee ÷ records). Soft fallback when empty.
  const feeBooks = paymentModeMix.reduce((s, p) => s + p.count, 0);
  const avgTicket =
    feeBooks > 0 && kpis.feeCollected + kpis.feeOutstanding > 0
      ? (kpis.feeCollected + kpis.feeOutstanding) / feeBooks
      : 0;

  const horizon = 30;
  const projectedLeads = leadsPerDay * horizon;
  const projectedWinsFromPipeline = kpis.openLeads * winRateFrac;
  const projectedRevenue =
    avgTicket > 0 ? projectedWinsFromPipeline * avgTicket : 0;
  const projectedForms = sessionsPerDay * formConvRate * horizon;
  const projectedCollectedCatchup =
    kpis.feeOutstanding > 0 ? kpis.feeOutstanding * 0.4 : 0; // assume 40% of outstanding collectable soon

  // Velocity: first half vs second half of window
  const mid = Math.floor(daily.length / 2);
  const firstHalf = daily.slice(0, mid).reduce((s, d) => s + d.leads, 0);
  const secondHalf = daily.slice(mid).reduce((s, d) => s + d.leads, 0);
  const velocityDeltaPct =
    firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : secondHalf > 0 ? 100 : 0;

  const callCoverage =
    leadsInRange > 0 ? callsInRange / leadsInRange : callsInRange > 0 ? Infinity : 0;

  const confidence: FounderBrief["confidence"] =
    closed >= 20 && leadsInRange >= 30
      ? "high"
      : closed >= 5 || leadsInRange >= 10
        ? "medium"
        : "low";

  const projections: FounderProjection[] = [
    {
      label: `Leads · next ${horizon}d`,
      value: fmtInt(projectedLeads),
      hint:
        leadsPerDay > 0
          ? `At ${round1(leadsPerDay)}/day from last ${days}d`
          : "No inflow in this window yet",
    },
    {
      label: "Projected wins · pipeline",
      value: winRateFrac > 0 ? `~${fmtInt(projectedWinsFromPipeline)}` : "—",
      hint:
        winRateFrac > 0
          ? `${kpis.openLeads} open × ${kpis.winRate.toFixed(0)}% win rate`
          : "Need closed outcomes to project",
    },
    {
      label: "Projected fee · pipeline",
      value: projectedRevenue > 0 ? `~${fmtMoney(projectedRevenue)}` : "—",
      hint:
        avgTicket > 0
          ? `Avg ticket ${fmtMoney(avgTicket)} × projected wins`
          : "Add fee records to unlock revenue projection",
    },
    {
      label: "Form handoffs · next 30d",
      value:
        sessionsPerDay > 0
          ? `~${fmtInt(projectedForms)}`
          : "—",
      hint:
        kpis.sessionsInRange > 0
          ? `${(formConvRate * 100).toFixed(1)}% session→form · traffic holds`
          : "No web sessions in range",
    },
  ];

  if (kpis.feeOutstanding > 0) {
    projections.push({
      label: "Collectable soon",
      value: `~${fmtMoney(projectedCollectedCatchup)}`,
      hint: `~40% of ${fmtMoney(kpis.feeOutstanding)} outstanding (heuristic)`,
    });
  }

  const insights: FounderInsight[] = [];

  if (kpis.unassigned > 0) {
    insights.push({
      id: "unassigned",
      severity: kpis.unassigned >= 5 ? "critical" : "watch",
      title: `${kpis.unassigned} unassigned lead${kpis.unassigned === 1 ? "" : "s"}`,
      detail: "Leads without an owner stall — nobody owns the next call.",
      tweak: "Allocate now or turn on round-robin so every form hit gets an owner in minutes.",
      href: "/admin/leads",
    });
  }

  if (kpis.openLeads > 0 && kpis.attentionLeads / kpis.openLeads >= 0.2) {
    insights.push({
      id: "attention",
      severity: "critical",
      title: `${kpis.attentionLeads} stuck in attention (${Math.round(
        (kpis.attentionLeads / kpis.openLeads) * 100
      )}% of open)`,
      detail: "DNP / no-show pile is eating capacity that should convert.",
      tweak: "Run a same-day attention blitz — callback scripts, reschedule slots, then re-score.",
      href: "/attention",
    });
  } else if (kpis.attentionLeads > 0) {
    insights.push({
      id: "attention-light",
      severity: "watch",
      title: `${kpis.attentionLeads} need a touch`,
      detail: "Small attention queue — easy win before it grows.",
      tweak: "Clear the attention board before chasing brand-new leads.",
      href: "/attention",
    });
  }

  if (leadsInRange > 3 && callCoverage < 0.8) {
    insights.push({
      id: "call-coverage",
      severity: "critical",
      title: `Call coverage is low (${round1(callCoverage)} calls per new lead)`,
      detail: `${leadsInRange} new leads vs ${callsInRange} calls in ${days}d — inbound is outrunning outreach.`,
      tweak: "Set a floor: every new lead gets a call same day. Track counselor call counts in the leaderboard.",
      href: "/admin/analytics",
    });
  } else if (leadsInRange > 0 && callCoverage >= 1.5) {
    insights.push({
      id: "call-coverage-good",
      severity: "good",
      title: `Solid dial intensity (${round1(callCoverage)} calls / new lead)`,
      detail: "Outreach is keeping pace with inflow.",
      tweak: "Keep the floor; shift spare capacity into interview booking and fee follow-ups.",
    });
  }

  if (velocityDeltaPct <= -25 && firstHalf + secondHalf >= 4) {
    insights.push({
      id: "velocity-down",
      severity: "critical",
      title: `Lead inflow down ${Math.abs(Math.round(velocityDeltaPct))}% in the second half of the window`,
      detail: "Pipeline refill is slowing — next month’s wins will suffer if this holds.",
      tweak: "Check campaign spend, landing pages, and form tracking. Open Marketing performance.",
      href: "/marketing/dashboard",
    });
  } else if (velocityDeltaPct >= 40 && firstHalf + secondHalf >= 4) {
    insights.push({
      id: "velocity-up",
      severity: "good",
      title: `Inflow up ${Math.round(velocityDeltaPct)}% recently`,
      detail: "Marketing or referrals are accelerating.",
      tweak: "Pre-allocate counselor capacity now so the surge doesn’t sit unassigned.",
      href: "/admin/leads",
    });
  }

  if (kpis.sessionsInRange >= 20 && formConvRate < 0.02) {
    insights.push({
      id: "form-conv",
      severity: "watch",
      title: `Site→form conversion is ${(formConvRate * 100).toFixed(1)}%`,
      detail: `${kpis.sessionsInRange} sessions → ${kpis.formConversionsInRange} forms.`,
      tweak: "Inspect heatmaps and top pages — CTA friction or wrong audience.",
      href: "/marketing/heatmaps",
    });
  }

  if (kpis.totalLeads >= 10 && kpis.attributed / kpis.totalLeads < 0.3) {
    insights.push({
      id: "attribution-gap",
      severity: "watch",
      title: `Only ${Math.round((kpis.attributed / kpis.totalLeads) * 100)}% of leads have marketing journey`,
      detail: "Hard to know which channels actually pay.",
      tweak: "Ensure website forms send session_id; review Marketing Box on recent leads.",
      href: "/marketing/conversions",
    });
  }

  if (closed >= 5 && kpis.winRate < 25) {
    insights.push({
      id: "win-rate",
      severity: "critical",
      title: `Win rate is ${kpis.winRate.toFixed(0)}% of closed`,
      detail: `${kpis.won} won / ${kpis.lost} lost — leak after interview or pricing?`,
      tweak: "Audit last 10 losses by stage. Fix the biggest drop-off stage first.",
      href: "/admin/analytics",
    });
  } else if (closed >= 5 && kpis.winRate >= 45) {
    insights.push({
      id: "win-rate-good",
      severity: "good",
      title: `Win rate healthy at ${kpis.winRate.toFixed(0)}%`,
      detail: "Closing quality is solid — scale volume carefully.",
      tweak: "Protect quality: don’t flood counselors beyond call coverage.",
    });
  }

  if (
    kpis.feeOutstanding > 0 &&
    kpis.feeCollected > 0 &&
    kpis.feeOutstanding > kpis.feeCollected * 0.6
  ) {
    insights.push({
      id: "fees",
      severity: "watch",
      title: `${fmtMoney(kpis.feeOutstanding)} outstanding vs ${fmtMoney(kpis.feeCollected)} collected`,
      detail: "Cash is stuck in open fee books.",
      tweak: "Weekly fee chase list for won/partial pays — target ~40% of outstanding this month.",
      href: "/admin/analytics",
    });
  }

  const activeCounselors = counselorBoard.filter((c) => c.total > 0);
  if (activeCounselors.length >= 2) {
    const byOpen = [...activeCounselors].sort((a, b) => b.open - a.open);
    const top = byOpen[0];
    const bottom = byOpen[byOpen.length - 1];
    if (top && bottom && top.open >= 5 && top.open >= bottom.open * 2.5) {
      insights.push({
        id: "load-imbalance",
        severity: "watch",
        title: `${top.name} holds ${top.open} open vs ${bottom.name}'s ${bottom.open}`,
        detail: "Uneven book size creates missed SLAs on the heavy side.",
        tweak: "Rebalance allocation or pause auto-assign to the heaviest counselor until caught up.",
        href: "/admin/leads",
      });
    }

    const byWin = activeCounselors.filter((c) => c.won + c.lost >= 3);
    if (byWin.length >= 2) {
      const sorted = [...byWin].sort((a, b) => b.winRate - a.winRate);
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];
      if (best && worst && best.winRate - worst.winRate >= 25) {
        insights.push({
          id: "coach",
          severity: "watch",
          title: `Win-rate gap: ${best.name} ${best.winRate.toFixed(0)}% vs ${worst.name} ${worst.winRate.toFixed(0)}%`,
          detail: "Process or skill variance — coachable, not mysterious.",
          tweak: `Shadow ${best.name}'s call/interview flow; apply the same checklist to ${worst.name}.`,
          href: "/admin/analytics",
        });
      }
    }
  }

  const weakVendor = vendorLoanStats
    .filter((v) => v.sent >= 3)
    .sort((a, b) => a.rate - b.rate)[0];
  if (weakVendor && weakVendor.rate < 40) {
    insights.push({
      id: "loan-vendor",
      severity: "watch",
      title: `${weakVendor.name} approval rate ${weakVendor.rate}%`,
      detail: `${weakVendor.approved}/${weakVendor.sent} approved+ — loan path is leaking admits.`,
      tweak: "Prefer higher-rate vendors for the next batch; fix docs checklist before send.",
    });
  }

  if (sourceMix[0] && kpis.totalLeads >= 8) {
    const topShare = sourceMix[0].count / kpis.totalLeads;
    if (topShare >= 0.55) {
      insights.push({
        id: "source-concentration",
        severity: "watch",
        title: `${Math.round(topShare * 100)}% of leads from “${sourceMix[0].name}”`,
        detail: "Channel concentration risk — one knob controls the pipeline.",
        tweak: "Seed a second channel this month so a spend cut doesn’t zero inflow.",
        href: "/marketing/performance",
      });
    }
  }

  if (kpis.interviewsToday === 0 && kpis.openLeads >= 5) {
    insights.push({
      id: "no-interviews",
      severity: "watch",
      title: "No interviews on the calendar today",
      detail: "Open book exists but nothing is being booked into decision moments.",
      tweak: "Counselors should book R1 from every warm call — measure interviews/week.",
    });
  }

  // Sort: critical → watch → good; cap list
  const order: Record<InsightSeverity, number> = { critical: 0, watch: 1, good: 2 };
  insights.sort((a, b) => order[a.severity] - order[b.severity]);
  const topInsights = insights.slice(0, 7);

  const criticalCount = topInsights.filter((i) => i.severity === "critical").length;
  const headline =
    criticalCount > 0
      ? `${criticalCount} thing${criticalCount === 1 ? "" : "s"} need founder attention`
      : topInsights.some((i) => i.severity === "watch")
        ? "Stable — a few tweaks will compound"
        : "Pipeline looks healthy";

  const narrativeParts: string[] = [];
  narrativeParts.push(
    `Last ${days}d: ${leadsInRange} new leads (${round1(leadsPerDay)}/day), ${wonInRange} wins logged, ${callsInRange} calls.`
  );
  if (winRateFrac > 0) {
    narrativeParts.push(
      `At the current ${kpis.winRate.toFixed(0)}% win rate, ~${fmtInt(
        projectedWinsFromPipeline
      )} of the ${kpis.openLeads} open leads could convert` +
        (projectedRevenue > 0 ? ` (~${fmtMoney(projectedRevenue)} fee book).` : ".")
    );
  } else {
    narrativeParts.push(
      "Not enough closed outcomes yet to trust a win-rate projection — keep logging wins/losses."
    );
  }
  if (velocityDeltaPct <= -25) {
    narrativeParts.push("Inflow is cooling in the second half of this window — marketing needs a look.");
  } else if (velocityDeltaPct >= 40) {
    narrativeParts.push("Inflow is accelerating — protect counselor capacity.");
  }
  if (confidence === "low") {
    narrativeParts.push("Confidence is low until more volume closes — treat numbers as direction, not destiny.");
  }

  return {
    headline,
    narrative: narrativeParts.join(" "),
    projections,
    insights: topInsights,
    confidence,
  };
}
