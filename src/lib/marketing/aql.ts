/** AQL = Acceptance Quality Limit */

export const QUALIFICATION_INTENTS = ["good", "maybe", "poor"] as const;
export type QualificationIntent = (typeof QUALIFICATION_INTENTS)[number];

export const FINANCIAL_CHECKS = ["pass", "pending", "fail"] as const;
export type FinancialCheck = (typeof FINANCIAL_CHECKS)[number];

export const DQ_REASONS = [
  "relocation",
  "brand",
  "bad_comms",
  "no_intent",
  "dnp",
  "job",
  "other_field",
  "ug_too_much_exp",
  "online",
  "other",
] as const;

export type DqReason = (typeof DQ_REASONS)[number];

export const DQ_REASON_LABELS: Record<DqReason, string> = {
  relocation: "Relocation",
  brand: "Brand",
  bad_comms: "Bad comms",
  no_intent: "No intent to join",
  dnp: "DNP",
  job: "Job",
  other_field: "From other field (tech)",
  ug_too_much_exp: "UG / too much exp",
  online: "Online",
  other: "Other",
};

export function meetsAqlCriteria(input: {
  qualification_intent?: string | null;
  financial_check?: string | null;
}): boolean {
  const intent = (input.qualification_intent ?? "").toLowerCase();
  const fin = (input.financial_check ?? "").toLowerCase();
  return (intent === "good" || intent === "maybe") && fin === "pass";
}

export function computeAqlAt(input: {
  qualification_intent?: string | null;
  financial_check?: string | null;
  existing_aql_at?: string | null;
}): string | null {
  if (input.existing_aql_at) return input.existing_aql_at;
  return meetsAqlCriteria(input) ? new Date().toISOString() : null;
}
