"use client";

import { setLeadApproval, updateLeadCardFields } from "@/app/actions/leads";
import type { LeadWithCard } from "@/lib/leads/card-metrics";
import { useState, useTransition } from "react";

export type ApprovalRole = "admin" | "counselor" | "interviewer";

/** Who may tick each approval: admins any, the admissions team theirs, panelists theirs. */
const APPROVAL_SLOTS: { slot: string; label: string; roles: ApprovalRole[] }[] = [
  { slot: "leadership", label: "Approved by Nikhil", roles: ["admin"] },
  { slot: "admissions", label: "Approved by Admissions", roles: ["admin", "counselor"] },
  { slot: "panel", label: "Approved by Panel", roles: ["admin", "interviewer"] },
];

/** Recording URL + multi-slot approval controls for panel-round cards. */
export function LeadCardApprovals({
  lead,
  canWriteApproval,
}: {
  lead: LeadWithCard;
  /** Viewer's role; null = read-only */
  canWriteApproval: ApprovalRole | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
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
              const res = await updateLeadCardFields(lead.id, { recording_url: next });
              setError(res.ok ? null : res.error);
            });
          }}
        />
      </label>
      {APPROVAL_SLOTS.map(({ slot, label, roles }) => {
        const existing = lead.cardMetrics?.approvals?.find((a) => a.slot === slot);
        const approved = Boolean(existing?.status);
        return (
          <label key={slot} className="flex items-center gap-2 text-[11px] text-navy">
            <input
              type="checkbox"
              checked={approved}
              disabled={pending || !canWriteApproval || !roles.includes(canWriteApproval)}
              onChange={(e) => {
                const status = e.target.checked;
                startTransition(async () => {
                  const res = await setLeadApproval({
                    leadId: lead.id,
                    slot,
                    label,
                    status,
                  });
                  setError(res.ok ? null : res.error);
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
      {error ? <p className="text-[11px] text-danger">{error}</p> : null}
    </div>
  );
}
