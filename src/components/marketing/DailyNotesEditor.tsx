"use client";

import { upsertMarketingDailyNote } from "@/app/actions/marketing-dashboard";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

export function DailyNotesEditor({
  date,
  notes,
  organicSpend,
  inorganicSpend,
}: {
  date: string;
  notes: string;
  organicSpend: number | null;
  inorganicSpend: number | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(Boolean(notes));

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await upsertMarketingDailyNote({
        note_date: date,
        notes: String(fd.get("notes") || ""),
        organic_spend_inr: fd.get("organic_spend_inr")
          ? Number(fd.get("organic_spend_inr"))
          : null,
        inorganic_spend_inr: fd.get("inorganic_spend_inr")
          ? Number(fd.get("inorganic_spend_inr"))
          : null,
      });
      if (!res.ok) setError(res.error);
      else {
        setError(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-1">
      <button
        type="button"
        className="text-[11px] font-semibold text-periwinkle"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Hide notes" : notes ? "Edit notes" : "Add notes"}
      </button>
      {notes && !open ? (
        <p className="mt-0.5 max-w-[220px] truncate text-[11px] text-muted">{notes}</p>
      ) : null}
      {open ? (
        <form onSubmit={onSubmit} className="mt-2 space-y-2 rounded-lg border border-border bg-navy/[0.02] p-2">
          <textarea
            name="notes"
            className="input-field min-h-[56px] text-xs"
            defaultValue={notes}
            placeholder="Offline spend / activations notes"
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] text-muted">
              Organic spend
              <input
                name="organic_spend_inr"
                type="number"
                min={0}
                className="input-field mt-0.5 text-xs"
                defaultValue={organicSpend ?? ""}
              />
            </label>
            <label className="text-[10px] text-muted">
              Inorganic spend
              <input
                name="inorganic_spend_inr"
                type="number"
                min={0}
                className="input-field mt-0.5 text-xs"
                defaultValue={inorganicSpend ?? ""}
              />
            </label>
          </div>
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          <button type="submit" className="btn-primary text-[11px]" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
