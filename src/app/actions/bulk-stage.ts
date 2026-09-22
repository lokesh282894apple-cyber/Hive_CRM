"use server";

import { updateLeadStage } from "@/app/actions/leads";
import { requireUser } from "@/lib/auth";
import {
  isBookingRequiredStage,
  stageRequiresPresetReason,
  stageRequiresReason,
  stageRequiresStudentIntent,
  STAGES,
  type Stage,
} from "@/lib/constants";
import { getFunnelConfig } from "@/lib/funnel/config";
import { revalidatePath } from "next/cache";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/**
 * Bulk stage move for HubSpot cleanup (OP-1).
 * Skips booking-required stages. Reason required stages need one shared reason.
 */
export async function bulkUpdateLeadStages(input: {
  leadIds: string[];
  stage: string;
  reason?: string;
  studentIntent?: number;
}): Promise<ActionResult<{ updated: number; failed: { id: string; error: string }[] }>> {
  await requireUser(["admin", "counselor"]);
  const ids = Array.from(new Set(input.leadIds.filter(Boolean))).slice(0, 200);
  if (ids.length === 0) return { ok: false, error: "Select at least one lead" };

  const stage = input.stage as Stage;
  const funnel = await getFunnelConfig();
  const known = new Set([...STAGES, ...funnel.activeSlugs]);
  if (!known.has(stage)) return { ok: false, error: "Invalid stage" };

  if (
    isBookingRequiredStage(stage) ||
    funnel.bookingRequiredSlugs.includes(stage)
  ) {
    return {
      ok: false,
      error: "Book interviews one lead at a time (date/time/panelist required).",
    };
  }

  if (stage === "closed_paid") {
    return {
      ok: false,
      error:
        "Closed won requires confirming program + cohort on each lead (use the board or lead detail).",
    };
  }

  const needsReason =
    stageRequiresReason(stage) ||
    funnel.reasonRequiredSlugs.includes(stage) ||
    stageRequiresPresetReason(stage);
  const reason = (input.reason || "").trim();
  if (needsReason && !reason) {
    return { ok: false, error: "This stage needs a reason" };
  }

  const intent = input.studentIntent;
  const needsIntent = stageRequiresStudentIntent(stage);
  if (needsIntent) {
    if (
      intent == null ||
      !Number.isInteger(intent) ||
      intent < 1 ||
      intent > 5
    ) {
      return { ok: false, error: "Student intent (1–5) is required" };
    }
  }

  let updated = 0;
  const failed: { id: string; error: string }[] = [];
  for (const id of ids) {
    const res = await updateLeadStage(
      id,
      stage,
      needsReason ? reason : undefined,
      needsIntent
        ? { studentIntent: intent }
        : { skipIntentRequirement: true }
    );
    if (res.ok) updated += 1;
    else failed.push({ id, error: res.error });
  }

  revalidatePath("/leads");
  revalidatePath("/admin/leads");
  return { ok: true, data: { updated, failed } };
}
