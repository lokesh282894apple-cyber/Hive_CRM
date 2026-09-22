"use client";

import { submitInterviewOutcome } from "@/app/actions/interviews";
import { StageScoreFields } from "@/components/leads/StageScoreFields";
import { INTERVIEW_OUTCOMES, type InterviewOutcome } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";
import type { InterviewBooking } from "@/types/database";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type BookingRow = InterviewBooking & {
  leads?: { id?: string; name: string; email: string | null; phone: string; stage: string } | null;
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
  const [gradeScores, setGradeScores] = useState<Record<string, string>>({});
  const [profileScores, setProfileScores] = useState<Record<string, number | "">>({});
  const [intentScores, setIntentScores] = useState<Record<string, number | "">>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

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
                  {b.leads?.id ? (
                    <Link
                      href={`/leads/${b.leads.id}`}
                      className="ml-2 text-xs font-semibold text-periwinkle hover:underline"
                    >
                      Open lead →
                    </Link>
                  ) : null}
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-72">
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
                  <StageScoreFields
                    profileScore={profileScores[b.id] ?? ""}
                    intentScore={intentScores[b.id] ?? ""}
                    notes={notes[b.id] ?? ""}
                    onProfileChange={(v) =>
                      setProfileScores((prev) => ({ ...prev, [b.id]: v }))
                    }
                    onIntentChange={(v) =>
                      setIntentScores((prev) => ({ ...prev, [b.id]: v }))
                    }
                    onNotesChange={(v) => setNotes((prev) => ({ ...prev, [b.id]: v }))}
                    notesLabel="Interview feedback"
                    notesPlaceholder="Mandatory feedback for this round"
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
                      placeholder="Grade /5"
                      value={gradeScores[b.id] ?? ""}
                      onChange={(e) =>
                        setGradeScores((prev) => ({ ...prev, [b.id]: e.target.value }))
                      }
                    />
                  </div>
                  {errors[b.id] ? (
                    <p className="text-xs text-danger">{errors[b.id]}</p>
                  ) : null}
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const profile = profileScores[b.id];
                        const intent = intentScores[b.id];
                        const feedback = notes[b.id] ?? "";
                        if (
                          profile === "" ||
                          intent === "" ||
                          feedback.trim().length < 2
                        ) {
                          setErrors((prev) => ({
                            ...prev,
                            [b.id]: "Profile, intent, and feedback are required",
                          }));
                          return;
                        }
                        const res = await submitInterviewOutcome({
                          bookingId: b.id,
                          outcome: outcomes[b.id] ?? "confirmed",
                          feedbackNotes: feedback,
                          profileScore: Number(profile),
                          intentScore: Number(intent),
                          gradeTier: tiers[b.id] ?? "B",
                          gradeScore: gradeScores[b.id]
                            ? Number(gradeScores[b.id])
                            : undefined,
                        });
                        if (!res.ok) {
                          setErrors((prev) => ({ ...prev, [b.id]: res.error }));
                          return;
                        }
                        setErrors((prev) => {
                          const next = { ...prev };
                          delete next[b.id];
                          return next;
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
                {b.feedback_notes ? (
                  <span className="mt-0.5 block text-xs text-muted line-clamp-1">
                    {b.feedback_notes}
                  </span>
                ) : null}
              </span>
              <span className="flex items-center gap-2 text-xs text-muted">
                {formatDateTime(b.scheduled_at)}
                {b.leads?.id ? (
                  <Link
                    href={`/leads/${b.leads.id}`}
                    className="font-semibold text-periwinkle hover:underline"
                  >
                    Lead
                  </Link>
                ) : null}
              </span>
            </li>
          ))}
          {past.length === 0 ? <li className="text-sm text-muted">No history yet.</li> : null}
        </ul>
      </section>
    </div>
  );
}
