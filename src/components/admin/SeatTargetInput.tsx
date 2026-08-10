"use client";

import { useState, useTransition } from "react";
import { setCohortSeatTarget } from "@/app/actions/settings";

export function SeatTargetInput({
  cohortId,
  seats,
}: {
  cohortId: string;
  seats: number | null;
}) {
  const [value, setValue] = useState(seats?.toString() ?? "");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function save() {
    const n = value.trim() === "" ? null : Number(value);
    if (n != null && (!Number.isFinite(n) || n < 0)) {
      setErr("Invalid");
      return;
    }
    setErr(null);
    startTransition(async () => {
      const res = await setCohortSeatTarget(cohortId, n);
      if (!res.ok) setErr(res.error);
    });
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min={0}
        className="w-16 rounded-lg border border-border bg-white px-2 py-1 text-sm text-navy"
        placeholder="Seats"
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        aria-label="Seat target"
      />
      {err ? <span className="text-[10px] text-red-600">{err}</span> : null}
    </div>
  );
}
