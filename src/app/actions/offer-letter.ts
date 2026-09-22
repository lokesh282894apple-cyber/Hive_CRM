"use server";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Re-dispatch the Offered stage email/WA template (US-4). */
export async function resendOfferLetter(leadId: string): Promise<ActionResult> {
  await requireUser(["admin", "counselor"]);
  const supabase = createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("id, stage, email")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { ok: false, error: "Lead not found" };
  if (lead.stage !== "offered" && lead.stage !== "yet_to_offer") {
    return { ok: false, error: "Lead must be Yet to offer or Offered" };
  }
  if (!lead.email) return { ok: false, error: "Lead has no email" };

  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { dispatchStageTriggers } = await import("@/lib/integrations/dispatch");
    await dispatchStageTriggers(createAdminClient(), {
      leadId,
      triggerKey: "offered",
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Send failed",
    };
  }

  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}
