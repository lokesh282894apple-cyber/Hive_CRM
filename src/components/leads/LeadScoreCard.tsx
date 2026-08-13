"use client";

import {
  clearLeadScoreOverride,
  recomputeLeadScoreAction,
  setLeadScoreOverride,
} from "@/app/actions/leads";
import type { ScoreBreakdown, ScoreReason } from "@/lib/leads/score";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

export const LEAD_SCORE_DETAIL_ID = "lead-conversion-detail";

function cleanReasonText(text: string) {
  return text.replace(/\s*\(~[+-]?\d+\s*pts\)\s*$/i, "").trim();
}

function scrollToScoreDetail() {
  const el = document.getElementById(LEAD_SCORE_DETAIL_ID);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function ReasonRow({ reason }: { reason: ScoreReason }) {
  const tone =
    reason.effect === "up"
      ? "text-emerald-700"
      : reason.effect === "down"
        ? "text-red-700"
        : "text-muted";
  const mark =
    reason.effect === "up" ? "+" : reason.effect === "down" ? "−" : "·";

  return (
    <li className={`flex gap-3 text-sm leading-snug ${tone}`}>
      <span className="w-3 shrink-0 pt-0.5 font-semibold">{mark}</span>
      <span className="min-w-0">
        <span className="font-medium capitalize text-navy/55">{reason.pillar}</span>
        <span className="text-navy/30"> · </span>
        <span>{cleanReasonText(reason.text)}</span>
        {reason.impactPts != null && reason.impactPts !== 0 ? (
          <span className="ml-1.5 tabular-nums text-navy/45">
            {reason.impactPts > 0 ? "+" : ""}
            {reason.impactPts}
          </span>
        ) : null}
      </span>
    </li>
  );
}

/** Compact score strip for the top of the Info tab. */
export function LeadScoreSummary({
  intentScore,
  scoreAuto,
  scoreOverride,
  breakdown,
}: {
  intentScore: number | null;
  scoreAuto: number | null;
  scoreOverride: number | null;
  breakdown?: ScoreBreakdown | null;
}) {
  const effective =
    scoreOverride ?? scoreAuto ?? intentScore ?? breakdown?.score ?? null;
  const modelScore = scoreAuto ?? breakdown?.score ?? null;
  const confidence = breakdown?.confidence ?? null;
  const isOverridden = scoreOverride != null;

  return (
    <div className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
        <div className="flex items-baseline gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
            Conversion
          </p>
          <p className="text-2xl font-semibold tabular-nums tracking-tight text-navy">
            {effective != null ? `${effective}%` : "—"}
          </p>
        </div>
        <p className="text-sm text-muted">
          {modelScore != null ? <span>Model {modelScore}%</span> : null}
          {modelScore != null && confidence != null ? (
            <span className="text-navy/25"> · </span>
          ) : null}
          {confidence != null ? <span>Evidence {confidence}%</span> : null}
          {isOverridden ? (
            <>
              <span className="text-navy/25"> · </span>
              <span className="font-medium text-navy">Adjusted</span>
            </>
          ) : null}
        </p>
      </div>
      <button
        type="button"
        className="btn-ghost border border-border text-xs"
        onClick={scrollToScoreDetail}
      >
        Why this score ↓
      </button>
    </div>
  );
}

export function LeadScoreCard({
  leadId,
  intentScore,
  scoreAuto,
  scoreOverride,
  scoreOverrideReason,
  scoreOverrideAt,
  breakdown,
}: {
  leadId: string;
  intentScore: number | null;
  scoreAuto: number | null;
  scoreOverride: number | null;
  scoreOverrideReason: string | null;
  scoreOverrideAt: string | null;
  breakdown?: ScoreBreakdown | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [score, setScore] = useState(
    String(scoreOverride ?? intentScore ?? scoreAuto ?? "")
  );
  const [reason, setReason] = useState(scoreOverrideReason ?? "");
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const effective =
    scoreOverride ?? scoreAuto ?? intentScore ?? breakdown?.score ?? null;
  const modelScore = scoreAuto ?? breakdown?.score ?? null;
  const isOverridden = scoreOverride != null;
  const reasons = breakdown?.reasons ?? [];
  const pillars = breakdown?.pillars;
  const confidence = breakdown?.confidence ?? null;

  const pillarEntries = pillars
    ? ([
        ["Web", pillars.web],
        ["Interest", pillars.interest],
        ["Engage", pillars.engagement],
        ["Fit", pillars.fit],
        ["Speed", pillars.velocity],
        ["Interview", pillars.interview],
        ["Offer", pillars.offer],
        ["Source", pillars.source],
      ] as const)
    : [];

  const drivers = useMemo(() => {
    const rest = reasons.filter((r) => r.pillar !== "overall");
    return rest.length ? rest : reasons.slice(1);
  }, [reasons]);

  const visible = showAll ? drivers : drivers.slice(0, 6);
  const more = drivers.length - visible.length;

  return (
    <div
      id={LEAD_SCORE_DETAIL_ID}
      className="panel scroll-mt-6 p-5 sm:p-6"
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="eyebrow">Conversion likelihood</p>
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
              Recompute
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-2">
            <p className="text-4xl font-semibold tabular-nums tracking-tight text-navy sm:text-5xl">
              {effective != null ? `${effective}%` : "—"}
            </p>
            <div className="pb-1 text-sm text-muted">
              {modelScore != null ? <span>Model {modelScore}%</span> : null}
              {modelScore != null && confidence != null ? (
                <span className="text-navy/25"> · </span>
              ) : null}
              {confidence != null ? <span>Evidence {confidence}%</span> : null}
              {isOverridden ? (
                <>
                  <span className="text-navy/25"> · </span>
                  <span className="font-medium text-navy">Your judgment</span>
                </>
              ) : null}
            </div>
          </div>

          {effective != null ? (
            <div className="mt-4 h-1.5 max-w-sm overflow-hidden rounded-full bg-navy/[0.06]">
              <div
                className="h-full rounded-full bg-navy/70"
                style={{ width: `${Math.min(100, Math.max(0, effective))}%` }}
              />
            </div>
          ) : null}

          {isOverridden && scoreOverrideReason ? (
            <p className="mt-3 text-sm text-muted">
              “{scoreOverrideReason}”
              {scoreOverrideAt ? (
                <span className="ml-1 opacity-70">
                  · {new Date(scoreOverrideAt).toLocaleString("en-IN")}
                </span>
              ) : null}
            </p>
          ) : (
            <p className="mt-3 max-w-md text-sm text-muted">
              Chance this lead becomes a student, from stage, web, calls,
              interviews, fit, and offer signals.
            </p>
          )}

          {pillarEntries.length ? (
            <dl className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {pillarEntries.map(([label, value]) => (
                <div key={label} className="flex items-baseline gap-1.5">
                  <dt className="text-muted">{label}</dt>
                  <dd className="font-semibold tabular-nums text-navy">{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          <div className="mt-6 border-t border-border pt-5">
            <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
              Adjust judgment
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-[100px_1fr]">
              <div>
                <label className="label-field">Score %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="input-field"
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                />
              </div>
              <div>
                <label className="label-field">Reason</label>
                <input
                  className="input-field"
                  placeholder="What the model can’t see…"
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
                    const res = await setLeadScoreOverride(
                      leadId,
                      Number(score),
                      reason
                    );
                    if (!res.ok) {
                      setError(res.error);
                      return;
                    }
                    router.refresh();
                  })
                }
              >
                Save
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
                  Use model
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="min-w-0 border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
          <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
            Why this score
          </p>
          {visible.length > 0 ? (
            <ul className="mt-3 space-y-2.5">
              {visible.map((r, i) => (
                <ReasonRow key={`${r.pillar}-${i}`} reason={r} />
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">
              Recompute to refresh evidence for this lead.
            </p>
          )}
          {more > 0 ? (
            <button
              type="button"
              className="mt-3 text-sm font-medium text-periwinkle hover:underline"
              onClick={() => setShowAll(true)}
            >
              Show {more} more
            </button>
          ) : null}
          {showAll && drivers.length > 6 ? (
            <button
              type="button"
              className="mt-3 text-sm font-medium text-periwinkle hover:underline"
              onClick={() => setShowAll(false)}
            >
              Show less
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
