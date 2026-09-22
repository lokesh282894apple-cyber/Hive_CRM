"use client";

import { markNoShowOrReschedule } from "@/app/actions/interviews";
import type { InterviewRound } from "@/lib/constants";
import { Loader2, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";

export function NoShowDialog({
  leadId,
  round,
  open,
  onClose,
  onDone,
}: {
  leadId: string;
  round: InterviewRound;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [informed, setInformed] = useState<"ghosted" | "informed" | "">("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setInformed("");
    setReason("");
    setError(null);
  }, [open, round]);

  if (!open || !mounted) return null;

  function confirm() {
    if (!informed) {
      setError("Pick whether they ghosted or informed us.");
      return;
    }
    if (informed === "informed" && reason.trim().length < 2) {
      setError("Add a short reason when they informed us.");
      return;
    }
    startTransition(async () => {
      const res = await markNoShowOrReschedule({
        leadId,
        round,
        kind: "no_show",
        noShowInformed: informed === "informed",
        noShowReason:
          informed === "informed"
            ? reason.trim()
            : reason.trim() || "Ghosted completely",
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone();
      onClose();
    });
  }

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-navy/50 backdrop-blur-[2px]"
        aria-label="Close"
        disabled={pending}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        className="relative z-10 w-full max-w-md rounded-t-2xl border border-border bg-white p-5 shadow-xl sm:rounded-2xl"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="eyebrow">No-show · {round}</p>
            <p className="mt-1 text-sm text-muted">
              Did the student ghost completely, or inform us?
            </p>
          </div>
          <button
            type="button"
            className="rounded-full p-1 text-muted hover:bg-navy/5 hover:text-navy"
            disabled={pending}
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm">
            <input
              type="radio"
              name="noshow"
              checked={informed === "ghosted"}
              onChange={() => setInformed("ghosted")}
            />
            Ghosted completely
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm">
            <input
              type="radio"
              name="noshow"
              checked={informed === "informed"}
              onChange={() => setInformed("informed")}
            />
            Informed us
          </label>
        </div>

        {informed === "informed" ? (
          <label className="mt-3 block text-xs font-semibold text-muted">
            Reason
            <textarea
              className="input-field mt-1 min-h-[72px]"
              placeholder="Why they missed the round"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        ) : null}

        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="btn-ghost border border-border"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-2"
            disabled={pending}
            onClick={confirm}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Mark no-show
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
