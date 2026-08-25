import "server-only";

export type TemplateVars = Record<string, string | null | undefined>;

export function mergeTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const v = vars[key];
    return v != null && String(v).trim() ? String(v) : "";
  });
}

/** Map CRM stage (or special keys) → trigger_key in stage_trigger_rules */
export function triggerKeyForStage(stage: string): string | null {
  const direct = [
    "new_lead",
    "call_logged_nurturing",
    "dnp",
    "r1_booked",
    "r1_reschedule",
    "r1_no_show",
    "r2_booked",
    "r2_reschedule",
    "r2_no_show",
    "r3_booked",
    "r3_reschedule",
    "r3_no_show",
    "yet_to_offer",
    "offered",
    "closed_won",
    "closed_lost",
  ];
  if (direct.includes(stage)) return stage;
  if (stage === "lead_created" || stage === "in_funnel") return "new_lead";
  return null;
}
