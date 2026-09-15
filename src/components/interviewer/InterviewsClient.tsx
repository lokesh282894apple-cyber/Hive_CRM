"use client";

import { submitInterviewOutcome } from "@/app/actions/interviews";
import { INTERVIEW_OUTCOMES, type InterviewOutcome } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import type { InterviewBooking } from "@/types/database";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type BookingRow = InterviewBooking & {
  leads?: { name: string; email: string | null; phone: string; stage: string } | null;
};

export function InterviewsClient({
  upcoming,
  past,
}: {
  upcoming: BookingRow[];
  past: BookingRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [outcomes, setOutcomes] = useState<Record<string, InterviewOutcome>>({});
  const [tiers, setTiers] = useState<Record<string, "A" | "B" | "C">>({});
  const [scores, setScores] = useState<Record<string, string>>({});

  return (
    <div className="space-y-8">
      <section className="panel p-5">
        <p className="eyebrow">Upcoming</p>
        <ul className="mt-4 space-y-4">
          {upcoming.map((b) => (
            <li key={b.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-navy">{b.leads?.name ?? "Lead"}</p>
                  <p className="text-xs text-muted">
                    {b.round} · {formatDateTime(b.scheduled_at)} · {b.leads?.phone}
                  </p>
                  {b.meet_link ? (
                    <a
                      href={b.meet_link}
                      className="text-xs text-periwinkle hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Join Meet
                    </a>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2 sm:w-64">
                  <select
                    className="input-field py-1.5"
                    value={outcomes[b.id] ?? "confirmed"}
                    onChange={(e) =>
                      setOutcomes((prev) => ({
                        ...prev,
                        [b.id]: e.target.value as InterviewOutcome,
                      }))
                    }
                  >
                    {INTERVIEW_OUTCOMES.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                  <textarea
                    className="input-field min-h-[60px]"
                    placeholder="Feedback notes"
                    value={notes[b.id] ?? ""}
                    onChange={(e) =>
                      setNotes((prev) => ({ ...prev, [b.id]: e.target.value }))
                    }
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      className="input-field py-1.5"
                      value={tiers[b.id] ?? "B"}
                      onChange={(e) =>
                        setTiers((prev) => ({
                          ...prev,
                          [b.id]: e.target.value as "A" | "B" | "C",
                        }))
                      }
                    >
                      <option value="A">Grade A</option>
                      <option value="B">Grade B</option>
                      <option value="C">Grade C</option>
                    </select>
                    <input
                      className="input-field py-1.5"
                      type="number"
                      min={0}
                      max={5}
                      step={0.1}
                      placeholder="Score /5"
                      value={scores[b.id] ?? ""}
                      onChange={(e) =>
                        setScores((prev) => ({ ...prev, [b.id]: e.target.value }))
                      }
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await submitInterviewOutcome({
                          bookingId: b.id,
                          outcome: outcomes[b.id] ?? "confirmed",
                          feedbackNotes: notes[b.id],
                          gradeTier: tiers[b.id] ?? "B",
                          gradeScore: scores[b.id] ? Number(scores[b.id]) : undefined,
                        });
                        router.refresh();
                      })
                    }
                  >
                    Submit outcome
                  </button>
                </div>
              </div>
            </li>
          ))}
          {upcoming.length === 0 ? (
            <li className="text-sm text-muted">No upcoming interviews.</li>
          ) : null}
        </ul>
      </section>

      <section className="panel p-5">
        <p className="eyebrow">History</p>
        <ul className="mt-4 space-y-2">
          {past.map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm"
            >
              <span>
                {b.leads?.name} · {b.round} · {b.outcome}
              </span>
              <span className="text-xs text-muted">{formatDateTime(b.scheduled_at)}</span>
            </li>
          ))}
          {past.length === 0 ? <li className="text-sm text-muted">No history yet.</li> : null}
        </ul>
      </section>
    </div>
  );
}
