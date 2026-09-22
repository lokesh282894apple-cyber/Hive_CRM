"use client";

import { updateLeadStage } from "@/app/actions/leads";
import { STAGE_LABELS, type Stage } from "@/lib/constants";
import { useFunnel } from "@/components/funnel/FunnelProvider";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function StageAdvanceDialog({
  open,
  leadId,
  leadName,
  fromStage,
  targetStage,
  onClose,
  onSuccess,
}: {
  open: boolean;
  leadId: string;
  leadName: string;
  fromStage?: string;
  targetStage: Stage | string;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const funnel = useFunnel();
  const [pending, startTransition] = useTransition();
  const [intent, setIntent] = useState<number | "">("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const toLabel =
    funnel?.labels[targetStage] ??
    STAGE_LABELS[targetStage as Stage] ??
    String(targetStage);
  const fromLabel = fromStage
    ? funnel?.labels[fromStage] ??
      STAGE_LABELS[fromStage as Stage] ??
      fromStage
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4">
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-white p-5 shadow-xl"
        role="dialog"
        aria-labelledby="stage-advance-title"
      >
        <h2 id="stage-advance-title" className="text-base font-semibold text-navy">
          Move {leadName}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {fromLabel ? `${fromLabel} → ` : ""}
          {toLabel}
        </p>
        <p className="mt-2 text-xs text-muted">
          Rate Average Student Intent (1–5) before advancing. This updates the
          lead average across counselor and panel scores.
        </p>

        <label className="mt-4 block text-xs font-semibold text-muted">
          Student intent (required)
          <select
            className="input-field mt-1"
            value={intent === "" ? "" : String(intent)}
            onChange={(e) =>
              setIntent(e.target.value ? Number(e.target.value) : "")
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

        <label className="mt-3 block text-xs font-semibold text-muted">
          Note (optional)
          <textarea
            className="input-field mt-1 min-h-[64px] text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why this rating / next step"
          />
        </label>

        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="btn-secondary text-xs"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary text-xs"
            disabled={pending || intent === ""}
            onClick={() => {
              if (intent === "") {
                setError("Pick student intent 1–5");
                return;
              }
              startTransition(async () => {
                const res = await updateLeadStage(
                  leadId,
                  targetStage,
                  note.trim() || undefined,
                  { studentIntent: intent }
                );
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                setError(null);
                onClose();
                onSuccess?.();
                router.refresh();
              });
            }}
          >
            Confirm move
          </button>
        </div>
      </div>
    </div>
  );
}
