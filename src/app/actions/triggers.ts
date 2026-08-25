"use server";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/app/actions/leads";

export type StageTriggerRule = {
  id: string;
  trigger_key: string;
  label: string;
  enabled: boolean;
  wa_enabled: boolean;
  email_enabled: boolean;
  wa_template_name: string | null;
  wa_template_lang: string;
  email_subject: string | null;
  email_body_html: string | null;
};

export async function listStageTriggerRules(): Promise<StageTriggerRule[]> {
  await requireUser(["admin"]);
  const supabase = createClient();
  const { data } = await supabase
    .from("stage_trigger_rules")
    .select("*")
    .order("label");
  return (data as StageTriggerRule[]) ?? [];
}

export async function updateStageTriggerRule(
  id: string,
  patch: Partial<
    Pick<
      StageTriggerRule,
      | "enabled"
      | "wa_enabled"
      | "email_enabled"
      | "wa_template_name"
      | "wa_template_lang"
      | "email_subject"
      | "email_body_html"
      | "label"
    >
  >
): Promise<ActionResult> {
  await requireUser(["admin"]);
  const supabase = createClient();
  const { error } = await supabase
    .from("stage_trigger_rules")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/config");
  return { ok: true };
}
