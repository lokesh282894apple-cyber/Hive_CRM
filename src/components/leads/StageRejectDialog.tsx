"use client";

import { updateLeadStage } from "@/app/actions/leads";
import {
  ADMISSION_REJECTION_CUSTOM_OPTION,
  ADMISSION_REJECTION_REASONS,
  STUDENT_REJECTION_NEEDS_DETAIL,
  STUDENT_REJECTION_REASONS,
  type Stage,
} from "@/lib/constants";
import { X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";

const HIVE_STAGES = new Set([
  "admission_team_rejected",
  "r1_reject",
  "r2_reject",
  "r3_reject",
]);

export function StageRejectDialog({
  leadId,
  leadName,
  targetStage,
  open,
  onClose,
  onRejected,
}: {
  leadId: string;
  leadName: string;
  targetStage: Stage | string;
  open: boolean;
  onClose: () => void;
  onRejected: (reason: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [preset, setPreset] = useState("");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isStudent = targetStage === "student_reject";
  const isHive = HIVE_STAGES.has(targetStage);
  const needsDetail =
    isStudent && STUDENT_REJECTION_NEEDS_DETAIL.includes(preset);
  const isCustom =
    preset === "Custom" || preset === ADMISSION_REJECTION_CUSTOM_OPTION;

  const resolvedReason = (() => {
    if (!preset) return "";
    if (isStudent && preset === "Joined elsewhere") {
      return detail.trim()
        ? `Joined elsewhere: ${detail.trim()}`
        : "";
    }
    if (isCustom) return detail.trim();
    return preset;
  })();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setPreset("");
    setDetail("");
    setError(null);
  }, [open, leadId, targetStage]);

  if (!open || !mounted) return null;

  const title = isStudent
    ? "Student Reject"
    : targetStage === "admission_team_rejected"
      ? "Admission Team Rejected"
      : "Hive Reject";

  const presets = isStudent
    ? STUDENT_REJECTION_REASONS
    : [...ADMISSION_REJECTION_REASONS, ADMISSION_REJECTION_CUSTOM_OPTION];

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-navy/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-white p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reject-dialog-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p
              id="reject-dialog-title"
              className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted"
            >
              {title}
            </p>
            <p className="mt-1 text-sm font-semibold text-navy">{leadName}</p>
            <p className="mt-1 text-xs text-muted">
              Pick a reason. The lead stays put until you confirm.
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

        <label className="label-field">Reason *</label>
        <select
          className="input-field mt-1"
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
          autoFocus
        >
          <option value="">Select reason…</option>
          {presets.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        {needsDetail || isCustom ? (
          <div className="mt-3">
            <label className="label-field">
              {preset === "Joined elsewhere" ? "Where did they join? *" : "Details *"}
            </label>
            <textarea
              className="input-field mt-1 min-h-[88px] text-sm"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder={
                preset === "Joined elsewhere"
                  ? "Program / school name…"
                  : "Type the reason…"
              }
            />
          </div>
        ) : null}

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={pending || !resolvedReason || resolvedReason.length < 2}
            onClick={() => {
              if (!resolvedReason || resolvedReason.length < 2) {
                setError("Pick a reason (and details if needed)");
                return;
              }
              if (!isStudent && !isHive) {
                setError("Unsupported reject stage");
                return;
              }
              startTransition(async () => {
                const res = await updateLeadStage(
                  leadId,
                  targetStage as Stage,
                  resolvedReason
                );
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                onRejected(resolvedReason);
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
