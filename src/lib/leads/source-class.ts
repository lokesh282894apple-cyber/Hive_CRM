/** Organic vs inorganic lead attribution — shared by analytics and lead cards. */

export type LeadSourceClass = "organic" | "inorganic";

const ORGANIC_SOURCES = new Set([
  "website",
  "referral",
  "walk_in",
  "partner",
  "other",
]);

/**
 * Classify a lead as organic or inorganic from free-text `source`
 * and optional campaign.source_type (paid_ad | influencer | organic).
 */
export function classifyLeadSource(
  source: string | null | undefined,
  campaignType: string | null | undefined
): LeadSourceClass {
  if (campaignType === "paid_ad" || campaignType === "influencer") {
    return "inorganic";
  }
  if (campaignType === "organic") return "organic";
  if (source === "meta_ad") return "inorganic";
  if (source && ORGANIC_SOURCES.has(source)) return "organic";
  // website:pgp etc.
  if (source?.startsWith("website")) return "organic";
  if (
    source?.includes("paid") ||
    source?.includes("facebook") ||
    source?.includes("meta")
  ) {
    return "inorganic";
  }
  return "organic";
}

export function leadSourceClassLabel(c: LeadSourceClass): string {
  return c === "organic" ? "Organic" : "Inorganic";
}
