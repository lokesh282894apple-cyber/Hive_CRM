"use client";

import { upsertMarketingDailyNote } from "@/app/actions/marketing-dashboard";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

export function ActivityLogEditor({
  date,
  activityLog,
  notes,
  organicSpend,
  inorganicSpend,
  items,
}: {
  date: string;
  activityLog: string;
  notes: string;
  organicSpend: number | null;
  inorganicSpend: number | null;
  items: {
    id: string;
    activity: string;
    owner: string | null;
    status: string | null;
    source: "activation" | "manual";
    attributedLeads?: number;
    channel?: string | null;
  }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await upsertMarketingDailyNote({
        note_date: date,
        notes,
        organic_spend_inr: organicSpend,
        inorganic_spend_inr: inorganicSpend,
        activity_log: String(fd.get("activity_log") || ""),
      });
      if (!res.ok) setError(res.error);
      else {
        setError(null);
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="min-w-[200px] max-w-[280px]">
      {items.length > 0 ? (
        <ul className="space-y-1 text-[11px] leading-snug text-navy">
          {items.map((a) => (
            <li key={a.id} className="flex gap-1.5">
              <span
                className={
                  a.source === "activation"
                    ? "mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
                    : "mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-periwinkle"
                }
              />
              <span>
                {a.activity}
                {a.status ? (
                  <span className="text-muted"> · {a.status}</span>
                ) : null}
                {a.channel ? (
                  <span className="text-muted"> · {a.channel}</span>
                ) : null}
                {a.attributedLeads ? (
                  <span className="font-semibold text-emerald-700">
                    {" "}
                    · {a.attributedLeads} leads
                  </span>
                ) : null}
                {a.owner ? <span className="text-muted"> · {a.owner}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-muted">No activity</p>
      )}
      <button
        type="button"
        className="mt-1 text-[11px] font-semibold text-periwinkle"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Cancel" : "Add / edit log"}
      </button>
      {open ? (
        <form onSubmit={onSubmit} className="mt-2 space-y-2 rounded-lg border border-border bg-navy/[0.02] p-2">
          <textarea
            name="activity_log"
            className="input-field min-h-[72px] text-xs"
            defaultValue={activityLog}
            placeholder={"One entry per line\ne.g. WhatsApp blast · Influencer post live"}
          />
          <p className="text-[10px] text-muted">
            Planning activations appear automatically. Manual lines for everything else.
          </p>
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          <button type="submit" className="btn-primary text-[11px]" disabled={pending}>
            {pending ? "Saving…" : "Save activity"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
