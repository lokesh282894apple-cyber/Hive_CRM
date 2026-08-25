import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateCronAuth } from "@/lib/marketing/track-auth";
import { dispatchStageTriggers } from "@/lib/integrations/dispatch";

/**
 * Fee-deadline reminders + retry failed message_logs.
 */
export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  if (!validateCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  let feeReminders = 0;
  let retries = 0;

  const in3d = new Date();
  in3d.setDate(in3d.getDate() + 3);
  const today = new Date().toISOString().slice(0, 10);
  const until = in3d.toISOString().slice(0, 10);

  const { data: due } = await admin
    .from("installments")
    .select(
      "id, deadline, amount_to_realise, status, fee_record_id, fee_records(lead_id, remaining_fee)"
    )
    .in("status", ["pending", "overdue", "partial"])
    .gte("deadline", today)
    .lte("deadline", until)
    .limit(200);

  const seen = new Set<string>();
  for (const row of due ?? []) {
    const fee = row.fee_records as unknown as {
      lead_id?: string;
      remaining_fee?: number;
    } | null;
    const leadId = fee?.lead_id;
    if (!leadId || seen.has(leadId)) continue;
    seen.add(leadId);
    await dispatchStageTriggers(admin, {
      leadId,
      triggerKey: "fee_deadline_approaching",
      extraVars: {
        payment_deadline: row.deadline,
        amount_due: String(row.amount_to_realise),
      },
    });
    feeReminders += 1;
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: failed } = await admin
    .from("message_logs")
    .select("id, lead_id, trigger_key")
    .eq("status", "failed")
    .gte("created_at", since)
    .limit(20);

  for (const row of failed ?? []) {
    await dispatchStageTriggers(admin, {
      leadId: row.lead_id,
      triggerKey: row.trigger_key,
    });
    await admin
      .from("message_logs")
      .update({ status: "queued", updated_at: new Date().toISOString() })
      .eq("id", row.id);
    retries += 1;
  }

  return NextResponse.json({ ok: true, feeReminders, retries });
}
