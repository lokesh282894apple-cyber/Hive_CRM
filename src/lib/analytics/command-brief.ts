import type { FounderCommand } from "@/lib/analytics/founder-command";
import {
  buildFounderBrief,
  type FounderBrief,
  type FounderInsight,
} from "@/lib/analytics/founder-brief";
import { formatCurrency } from "@/lib/utils";

/** Prefer command-aware insights; fall back to admissions brief. */
export function buildCommandBrief(cmd: FounderCommand): FounderBrief {
  const base = buildFounderBrief(cmd.admissions);
  const ns = cmd.northStar;
  const insights: FounderInsight[] = [];

  if (ns.verdict === "unset") {
    insights.push({
      id: "set-seats",
      severity: "watch",
      title: "Seat targets not set",
      detail: "Fill % and On track / Off track need a seat number per cohort.",
      tweak: "Set seats on the cohort board below to unlock the north-star.",
    });
  } else if (ns.verdict === "off_track") {
    insights.push({
      id: "fill-off",
      severity: "critical",
      title: `${ns.cohortName ?? "Cohort"} is off track`,
      detail: `Projected ~${Math.round(ns.projectedFill)} vs ${ns.seats} seats (${ns.projectedFillPct?.toFixed(0) ?? "—"}%).`,
      tweak: "Raise yield (Offer→Won) or accelerate R1 booking before start date.",
      href: "/admin/leads",
    });
  } else if (ns.verdict === "at_risk") {
    insights.push({
      id: "fill-risk",
      severity: "watch",
      title: `${ns.cohortName ?? "Cohort"} at risk of under-fill`,
      detail: `Projected ~${Math.round(ns.projectedFillLow)}–${Math.round(ns.projectedFillHigh)} against ${ns.seats} seats.`,
      tweak: "Protect yield this week — clear attention queue and book interviews.",
      href: "/attention",
    });
  } else {
    insights.push({
      id: "fill-ok",
      severity: "good",
      title: `${ns.cohortName ?? "Cohort"} looks on track`,
      detail: `Projected fill ~${Math.round(ns.projectedFill)} / ${ns.seats}.`,
      tweak: "Keep call coverage and watch melt on offered leads.",
    });
  }

  if (cmd.biggestLeak && cmd.biggestLeak.rate != null) {
    insights.push({
      id: "leak",
      severity: cmd.biggestLeak.rate < 25 ? "critical" : "watch",
      title: `Biggest leak: ${cmd.biggestLeak.name} (${cmd.biggestLeak.rate.toFixed(0)}%)`,
      detail: `${cmd.biggestLeak.toCount} of ${cmd.biggestLeak.fromCount} advanced.`,
      tweak: "Fix this step first — compounding gains beat top-of-funnel spend.",
      href: "/admin/analytics",
    });
  }

  if (ns.medianHoursToFirstCall != null && ns.medianHoursToFirstCall > 24) {
    insights.push({
      id: "sla",
      severity: ns.medianHoursToFirstCall > 72 ? "critical" : "watch",
      title: `Median first call is ${ns.medianHoursToFirstCall.toFixed(0)}h`,
      detail: "Speed-to-lead drives inquiry→interview conversion.",
      tweak: "Same-day call SLA for every new website lead.",
      href: "/admin/leads",
    });
  }

  if (cmd.money.overdueAmount > 0) {
    insights.push({
      id: "cash-overdue",
      severity: "watch",
      title: `${formatCurrency(cmd.money.overdueAmount)} in overdue installments`,
      detail: `${cmd.money.overdueCount} installment(s) past deadline.`,
      tweak: "Run a fee chase list this week before chasing new pipeline.",
      href: "/admin/analytics",
    });
  }

  if (!cmd.cpe.available) {
    insights.push({
      id: "cpe-missing",
      severity: "watch",
      title: "Cost per enrolled is unavailable",
      detail: "No ad spend connected and no manual monthly spend set.",
      tweak: "Enter monthly ad spend in Admin Config, or connect platforms later.",
      href: "/admin/config",
    });
  }

  // Merge unique base insights that aren't redundant
  for (const ins of base.insights) {
    if (insights.some((i) => i.id === ins.id || i.title === ins.title)) continue;
    if (insights.length >= 5) break;
    insights.push(ins);
  }

  const verdictLabel =
    ns.verdict === "on_track"
      ? "On track"
      : ns.verdict === "at_risk"
        ? "At risk"
        : ns.verdict === "off_track"
          ? "Off track"
          : "Set seat targets";

  const fillText =
    ns.seats != null
      ? cmd.confidence === "low"
        ? `projected ~${Math.round(ns.projectedFillLow)}–${Math.round(ns.projectedFillHigh)} of ${ns.seats}`
        : `projected ~${Math.round(ns.projectedFill)} of ${ns.seats}`
      : "seats unset";

  return {
    headline: `${verdictLabel} · ${ns.cohortName ?? "Next cohort"}`,
    narrative: `${ns.cohortName ?? "Pipeline"}: ${ns.won} won, ${ns.open} open · ${fillText}. Yield ${ns.yieldRate.toFixed(0)}% Offer→Won. ${
      ns.projectedFee > 0
        ? `Projected fee book ~${formatCurrency(ns.projectedFee)}.`
        : "Add fee records to unlock fee projection."
    } ${cmd.confidenceReason}.`,
    projections: base.projections,
    insights: insights.slice(0, 5),
    confidence: cmd.confidence,
  };
}
