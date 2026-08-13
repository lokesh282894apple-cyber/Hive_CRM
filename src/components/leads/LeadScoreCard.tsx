"use client";

import {
  clearLeadScoreOverride,
  recomputeLeadScoreAction,
  setLeadScoreOverride,
} from "@/app/actions/leads";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function LeadScoreCard({
  leadId,
  intentScore,
  scoreAuto,
  scoreOverride,
  scoreOverrideReason,
  scoreOverrideAt,
}: {
  leadId: string;
  intentScore: number | null;
  scoreAuto: number | null;
  scoreOverride: number | null;
  scoreOverrideReason: string | null;
  scoreOverrideAt: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [score, setScore] = useState(String(scoreOverride ?? intentScore ?? scoreAuto ?? ""));
  const [reason, setReason] = useState(scoreOverrideReason ?? "");
  const [error, setError] = useState<string | null>(null);

  const effective = scoreOverride ?? scoreAuto ?? intentScore;
  const isOverridden = scoreOverride != null;

  return (
    <div className="panel p-5">
      <p className="eyebrow">Lead score</p>
      <div className="mt-3 flex items-end gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
            Effective
          </p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-navy">
            {effective != null ? effective : "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">Auto</p>
          <p className="mt-1 text-lg tabular-nums text-muted">
            {scoreAuto != null ? scoreAuto : "—"}
          </p>
        </div>
        {isOverridden ? (
          <span className="mb-1 rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-semibold text-navy">
            Counselor adjusted
          </span>
        ) : null}
      </div>
      {isOverridden && scoreOverrideReason ? (
        <p className="mt-2 text-xs text-muted">
          “{scoreOverrideReason}”
          {scoreOverrideAt ? (
            <span className="ml-1 opacity-70">
              · {new Date(scoreOverrideAt).toLocaleString("en-IN")}
            </span>
          ) : null}
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted">
          Auto score updates from stage, interviews, calls, and source. Adjust after talking to the
          lead or for outside factors.
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label-field">Adjust score (0–100)</label>
          <input
            type="number"
            min={0}
            max={100}
            className="input-field mt-1"
            value={score}
            onChange={(e) => setScore(e.target.value)}
          />
        </div>
        <div>
          <label className="label-field">Reason</label>
          <input
            className="input-field mt-1"
            placeholder="After call / outside factor…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await setLeadScoreOverride(leadId, Number(score), reason);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              router.refresh();
            })
          }
        >
          Save adjustment
        </button>
        {isOverridden ? (
          <button
            type="button"
            className="btn-ghost border border-border"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await clearLeadScoreOverride(leadId);
                setReason("");
                router.refresh();
              })
            }
          >
            Clear override
          </button>
        ) : null}
        <button
          type="button"
          className="btn-ghost border border-border"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await recomputeLeadScoreAction(leadId);
              router.refresh();
            })
          }
        >
          Recompute auto
        </button>
      </div>
    </div>
  );
}
