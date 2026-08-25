/** Marketing metric formulas — Excel Data Dictionary tab 16 */

export function safeDiv(num: number, den: number): number | null {
  if (!den || !Number.isFinite(den)) return null;
  return num / den;
}

export function pct(num: number, den: number): number | null {
  const v = safeDiv(num, den);
  return v == null ? null : v * 100;
}

export function formatInr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatPct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

export function formatRatio(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

export function blendedCpl(totalSpend: number, leads: number): number | null {
  return safeDiv(totalSpend, leads);
}

export function cpaql(totalSpend: number, aql: number): number | null {
  return safeDiv(totalSpend, aql);
}

export function costPerR1(totalSpend: number, r1: number): number | null {
  return safeDiv(totalSpend, r1);
}

export function liveCpa(mtdSpend: number, mtdConverts: number): number | null {
  if (mtdConverts <= 0) return null;
  return safeDiv(mtdSpend, mtdConverts);
}

export function liveCac(
  mtdSpend: number,
  mtdSalesCost: number,
  mtdConverts: number
): number | null {
  if (mtdConverts <= 0) return null;
  return safeDiv(mtdSpend + mtdSalesCost, mtdConverts);
}

export function roas(revenue: number, spend: number): number | null {
  return safeDiv(revenue, spend);
}

export function roiPct(revenue: number, spend: number): number | null {
  const v = safeDiv(revenue - spend, spend);
  return v == null ? null : v * 100;
}

export function hookRate(video3s: number, impressions: number): number | null {
  return pct(video3s, impressions);
}

export function cpm(spend: number, impressions: number): number | null {
  const v = safeDiv(spend, impressions);
  return v == null ? null : v * 1000;
}

export function cpc(spend: number, clicks: number): number | null {
  return safeDiv(spend, clicks);
}

export function ctr(clicks: number, impressions: number): number | null {
  return pct(clicks, impressions);
}

export function publishRate(published: number, missed: number): number | null {
  const denom = published + missed;
  return pct(published, denom);
}

export function tofuPct(stageCount: number, totalLeads: number): number | null {
  return pct(stageCount, totalLeads);
}

export function mofuPct(stageCount: number, prevStage: number): number | null {
  return pct(stageCount, prevStage);
}

/** Paid UTM mediums per Excel dictionary */
const PAID_MEDIUMS = new Set(["paid", "cpc", "ppc", "cpm", "paidsocial"]);

export function isInorganicLead(input: {
  utm_medium?: string | null;
  source?: string | null;
  campaignSourceType?: string | null;
}): boolean {
  if (input.campaignSourceType === "paid_ad") return true;
  const medium = (input.utm_medium ?? "").toLowerCase();
  if (PAID_MEDIUMS.has(medium)) return true;
  const src = (input.source ?? "").toLowerCase();
  if (/meta|facebook|google|linkedin.*paid/.test(src)) return true;
  return false;
}

export function isMetaFormsLead(source: string | null | undefined): boolean {
  const s = (source ?? "").toLowerCase();
  return s.includes("meta") || s === "meta_lead_ads";
}
