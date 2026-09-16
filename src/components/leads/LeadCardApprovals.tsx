"use client";

import { setLeadApproval, updateLeadCardFields } from "@/app/actions/leads";
import type { LeadWithCard } from "@/lib/leads/card-metrics";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const APPROVAL_SLOTS: { slot: string; label: string }[] = [
  { slot: "leadership", label: "Approved by Nikhil" },
  { slot: "admissions", label: "Approved by Admissions" },
  { slot: "panel", label: "Approved by Panel" },
];

/** Recording URL + multi-slot approval controls for panel-round cards. */
export function LeadCardApprovals({
  lead,
  canWriteApproval,
}: {
  lead: LeadWithCard;
  canWriteApproval: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState(
    lead.cardMetrics?.recordingUrl ||
      (lead as { recording_url?: string | null }).recording_url ||
      ""
  );

  const isPanel =
    lead.stage.startsWith("r1_") ||
    lead.stage.startsWith("r2_") ||
    lead.stage.startsWith("r3_");
  if (!isPanel) return null;

  return (
    <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
      <label className="block text-[10px] font-semibold uppercase tracking-eyebrow text-muted">
        Recording link
        <input
          className="input-field mt-0.5 py-1 text-[11px]"
          type="url"
          placeholder="https://…"
          value={url}
          disabled={pending}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => {
            const next = url.trim() || null;
            const prev =
              lead.cardMetrics?.recordingUrl ||
              (lead as { recording_url?: string | null }).recording_url ||
              null;
            if (next === prev) return;
            startTransition(async () => {
              await updateLeadCardFields(lead.id, { recording_url: next });
              router.refresh();
            });
          }}
        />
      </label>
      {APPROVAL_SLOTS.map(({ slot, label }) => {
        const existing = lead.cardMetrics?.approvals?.find((a) => a.slot === slot);
        const approved = Boolean(existing?.status);
        return (
          <label key={slot} className="flex items-center gap-2 text-[11px] text-navy">
            <input
              type="checkbox"
              checked={approved}
              disabled={pending || !canWriteApproval}
              onChange={(e) => {
                const status = e.target.checked;
                startTransition(async () => {
                  await setLeadApproval({
                    leadId: lead.id,
                    slot,
                    label,
                    status,
                  });
                  router.refresh();
                });
              }}
            />
            <span className={approved ? "font-semibold text-success" : ""}>
              {label}
              {existing?.approvedByName ? ` · ${existing.approvedByName}` : ""}
            </span>
          </label>
        );
      })}
    </div>
  );
}
