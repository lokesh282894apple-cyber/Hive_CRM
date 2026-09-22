"use client";

import { updateLeadStage } from "@/app/actions/leads";
import {
  ADMISSION_REJECTION_CUSTOM_OPTION,
  ADMISSION_REJECTION_REASONS,
} from "@/lib/constants";
import { X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";

export function AdmissionRejectDialog({
  leadId,
  leadName,
  open,
  onClose,
  onRejected,
}: {
  leadId: string;
  leadName: string;
  open: boolean;
  onClose: () => void;
  onRejected: (reason: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [preset, setPreset] = useState("");
  const [customText, setCustomText] = useState("");
  const [studentIntent, setStudentIntent] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isCustom = preset === ADMISSION_REJECTION_CUSTOM_OPTION;
  const resolvedReason = isCustom ? customText.trim() : preset;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setPreset("");
    setCustomText("");
    setStudentIntent("");
    setError(null);
  }, [open, leadId]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-navy/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
              Admission Team Rejected
            </p>
            <p className="mt-1 text-sm font-semibold text-navy">{leadName}</p>
            <p className="mt-1 text-xs text-muted">
              Select a reason of rejection to move this lead.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1 text-muted hover:bg-slate-100 hover:text-navy"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="label-field">Reason of Rejection *</label>
        <select
          className="input-field mt-1"
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
          autoFocus
        >
          <option value="">Select reason…</option>
          {ADMISSION_REJECTION_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
          <option value={ADMISSION_REJECTION_CUSTOM_OPTION}>Custom</option>
        </select>

        {isCustom ? (
          <div className="mt-3">
            <label className="label-field">Custom reason *</label>
            <textarea
              className="input-field mt-1 min-h-[88px] text-sm"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Type the rejection reason…"
              autoFocus
            />
          </div>
        ) : null}

        {error ? (
          <p className="mt-3 text-sm text-red-600">{error}</p>
        ) : null}

        <label className="mt-3 block text-xs font-semibold text-muted">
          Student intent (1–5, required)
          <select
            className="input-field mt-1"
            value={studentIntent === "" ? "" : String(studentIntent)}
            onChange={(e) =>
              setStudentIntent(e.target.value ? Number(e.target.value) : "")
            }
          >
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={
              pending ||
              !preset ||
              (isCustom && customText.trim().length < 2) ||
              studentIntent === ""
            }
            onClick={() => {
              if (!preset) {
                setError("Pick a reason of rejection");
                return;
              }
              if (isCustom && customText.trim().length < 2) {
                setError("Type a custom reason");
                return;
              }
              if (studentIntent === "") {
                setError("Pick student intent 1–5");
                return;
              }
              const reason = resolvedReason;
              startTransition(async () => {
                const res = await updateLeadStage(
                  leadId,
                  "admission_team_rejected",
                  reason,
                  { studentIntent }
                );
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                onRejected(reason);
              });
            }}
          >
            {pending ? "Saving…" : "Confirm reject"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
