"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Call length as minutes + seconds, posted as `duration` (total seconds).
 * Required when the outcome is "connected" — talk time on the counselor
 * dashboard comes only from this field (Sep 2026: 2 of 332 connected calls
 * had one). Reads the form's `outcome` select like CallScoreFields.
 */
export function CallDurationField({ compact = false }: { compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [outcome, setOutcome] = useState("connected");
  const [min, setMin] = useState("");
  const [sec, setSec] = useState("");

  useEffect(() => {
    const form = ref.current?.closest("form");
    const select = form?.querySelector<HTMLSelectElement>('select[name="outcome"]');
    if (!form || !select) return;
    setOutcome(select.value);
    const onChange = () => setOutcome(select.value);
    const onReset = () => {
      setMin("");
      setSec("");
    };
    select.addEventListener("change", onChange);
    form.addEventListener("reset", onReset);
    return () => {
      select.removeEventListener("change", onChange);
      form.removeEventListener("reset", onReset);
    };
  }, []);

  const required = outcome === "connected";
  const total = (Number(min) || 0) * 60 + (Number(sec) || 0);
  const labelCls = compact ? "text-[10px] font-semibold uppercase text-muted" : "label-field";
  const inputCls = compact ? "input-field mt-1 text-xs" : "input-field";

  return (
    <div ref={ref}>
      <label className={labelCls}>Call length{required ? " *" : ""}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          max={600}
          inputMode="numeric"
          placeholder="min"
          aria-label="Minutes"
          className={inputCls}
          value={min}
          onChange={(e) => setMin(e.target.value)}
        />
        <span className="text-xs text-muted">:</span>
        <input
          type="number"
          min={0}
          max={59}
          inputMode="numeric"
          placeholder="sec"
          aria-label="Seconds"
          className={inputCls}
          value={sec}
          onChange={(e) => setSec(e.target.value)}
        />
      </div>
      {/* Hidden total in seconds; empty when not entered so the server can require it */}
      <input type="hidden" name="duration" value={total > 0 ? String(total) : ""} />
      {required && total === 0 ? (
        <p className="mt-0.5 text-[10px] text-muted">Required for connected calls</p>
      ) : null}
    </div>
  );
}
