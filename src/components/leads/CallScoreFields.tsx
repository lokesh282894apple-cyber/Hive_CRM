"use client";

import { useEffect, useRef, useState } from "react";
import { COUNSELOR_SCORING_STAGES, LEAD_QUALITY_PARTS, needsCallScore } from "@/lib/constants";

const SCALE: Record<number, string> = {
  1: "Very poor",
  2: "Poor",
  3: "Okay",
  4: "Good",
  5: "Excellent",
};

function totalTone(total: number | null) {
  if (total == null) return "bg-navy/5 text-muted";
  if (total >= 12) return "bg-emerald-100 text-emerald-800";
  if (total >= 8) return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-700";
}

/**
 * Intent / Comms / Profile (1–5) inside a "Log a call" form.
 * Shown only for Call Logged – Nurturing and R1 Booked; required when the
 * call outcome means the counselor actually spoke to the student.
 */
export function CallScoreFields({ stage }: { stage: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [outcome, setOutcome] = useState("connected");
  const [values, setValues] = useState<Record<string, number>>({});

  useEffect(() => {
    const form = ref.current?.closest("form");
    const select = form?.querySelector<HTMLSelectElement>('select[name="outcome"]');
    if (!form || !select) return;
    setOutcome(select.value);
    const onChange = () => setOutcome(select.value);
    const onReset = () => setValues({});
    select.addEventListener("change", onChange);
    form.addEventListener("reset", onReset);
    return () => {
      select.removeEventListener("change", onChange);
      form.removeEventListener("reset", onReset);
    };
  }, []);

  if (!(COUNSELOR_SCORING_STAGES as readonly string[]).includes(stage)) {
    return <div ref={ref} hidden />;
  }

  const required = needsCallScore(stage, outcome);
  const filled = LEAD_QUALITY_PARTS.filter((p) => values[p.key]).length;
  const total =
    filled === LEAD_QUALITY_PARTS.length
      ? LEAD_QUALITY_PARTS.reduce((n, p) => n + values[p.key], 0)
      : null;

  return (
    <div ref={ref} className="rounded-xl border border-border bg-[#F7F8FC] p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-navy">Lead quality</p>
          <p className="text-[11px] text-muted">
            {required
              ? `Required for this call · ${filled}/3 scored`
              : "Optional — no conversation on this call"}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums ${totalTone(total)}`}
        >
          {total != null ? total : "–"}/15
        </span>
      </div>

      <div className="mt-3 space-y-2.5">
        {LEAD_QUALITY_PARTS.map((p) => {
          const v = values[p.key];
          return (
            <div key={p.key}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <p className="text-xs font-medium text-navy">
                  {p.label}
                  <span className="ml-1 font-normal text-muted">· {p.hint}</span>
                </p>
                <span className="shrink-0 text-[11px] text-muted">{v ? SCALE[v] : ""}</span>
              </div>
              {/* Opacity-0 radios stay on the tap target so focus cannot scroll the page away. */}
              <div
                className="grid grid-cols-5 gap-1"
                role="radiogroup"
                aria-label={`${p.label}: ${p.hint}`}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <label
                    key={n}
                    title={SCALE[n]}
                    className={`relative flex h-8 cursor-pointer items-center justify-center rounded-lg border text-sm font-medium transition focus-within:ring-2 focus-within:ring-periwinkle/50 ${
                      v === n
                        ? "border-navy bg-navy text-white"
                        : v && n < v
                          ? "border-navy/20 bg-navy/10 text-navy"
                          : "border-border bg-white text-navy hover:border-navy/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`score_${p.key}`}
                      value={n}
                      required={required}
                      checked={v === n}
                      onChange={() => setValues((cur) => ({ ...cur, [p.key]: n }))}
                      className="absolute inset-0 z-10 cursor-pointer opacity-0"
                      aria-label={`${n} — ${SCALE[n]}`}
                    />
                    <span aria-hidden="true">{n}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
