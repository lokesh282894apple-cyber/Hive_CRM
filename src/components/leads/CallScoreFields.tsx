"use client";

import { useEffect, useRef, useState } from "react";
import { COUNSELOR_SCORING_STAGES, LEAD_QUALITY_PARTS, needsCallScore } from "@/lib/constants";

/**
 * Intent / Comms / Profile (1–5) inside a "Log a call" form. Shown while the
 * lead is pre-R1 or R1 Booked; required when the call outcome means the
 * counselor actually spoke to the student. Reads the form's `outcome` select.
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

  if (!(COUNSELOR_SCORING_STAGES as readonly string[]).includes(stage)) return <div ref={ref} hidden />;
  const required = needsCallScore(stage, outcome);
  const total = LEAD_QUALITY_PARTS.every((p) => values[p.key])
    ? LEAD_QUALITY_PARTS.reduce((n, p) => n + values[p.key], 0)
    : null;

  return (
    <div ref={ref} className="rounded-xl border border-border bg-[#F7F8FC] px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-eyebrow text-muted">
          Lead quality {required ? "· required" : "· optional (no conversation)"}
        </p>
        <p className="text-sm font-semibold text-navy">{total != null ? `${total}/15` : "—/15"}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {LEAD_QUALITY_PARTS.map((p) => (
          <fieldset key={p.key}>
            <legend className="mb-1 text-xs font-medium text-navy" title={p.hint}>
              {p.label}
            </legend>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <label
                  key={n}
                  className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border text-sm ${
                    values[p.key] === n
                      ? "border-navy bg-navy text-white"
                      : "border-border bg-white text-navy hover:border-navy/40"
                  }`}
                >
                  <input
                    type="radio"
                    name={`score_${p.key}`}
                    value={n}
                    required={required}
                    checked={values[p.key] === n}
                    onChange={() => setValues((v) => ({ ...v, [p.key]: n }))}
                    className="sr-only"
                  />
                  {n}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  );
}
