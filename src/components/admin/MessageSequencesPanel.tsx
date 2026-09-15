"use client";

import {
  deleteMessageSequence,
  saveSequenceSteps,
  upsertMessageSequence,
  type SequenceWithSteps,
} from "@/app/actions/sequences";
import type { StageTriggerRule } from "@/app/actions/triggers";
import type { Course } from "@/types/database";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

type DraftStep = {
  channel: "whatsapp" | "email";
  delay_hours: number;
  wa_template_name: string;
  email_subject: string;
  email_body_html: string;
};

export function MessageSequencesPanel({
  courses,
  triggerRules,
  sequences,
}: {
  courses: Course[];
  triggerRules: StageTriggerRule[];
  sequences: SequenceWithSteps[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [courseId, setCourseId] = useState<string>("");
  const [triggerKey, setTriggerKey] = useState(triggerRules[0]?.trigger_key ?? "new_lead");

  const matching = useMemo(() => {
    const cid = courseId || null;
    return (
      sequences.find((s) => s.trigger_key === triggerKey && (s.course_id ?? "") === (cid ?? "")) ??
      sequences.find((s) => s.trigger_key === triggerKey && s.course_id == null) ??
      null
    );
  }, [sequences, triggerKey, courseId]);

  const [steps, setSteps] = useState<DraftStep[]>([]);

  useEffect(() => {
    setSteps(
      (matching?.steps ?? []).map((s) => ({
        channel: s.channel,
        delay_hours: s.delay_hours,
        wa_template_name: s.wa_template_name ?? "",
        email_subject: s.email_subject ?? "",
        email_body_html: s.email_body_html ?? "",
      }))
    );
  }, [matching?.id]);

  function move(i: number, dir: -1 | 1) {
    setSteps((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      const tmp = next[i];
      next[i] = next[j];
      next[j] = tmp;
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Default sequence applies to every program. Pick a course to override (AI Marketing, PGP,
        UG…). If a program has no override, the default is used.
      </p>
      {msg ? <p className="text-sm text-periwinkle">{msg}</p> : null}
      <div className="flex flex-wrap gap-3">
        <label className="text-xs font-semibold text-muted">
          Program
          <select
            className="input-field mt-1 min-w-[200px]"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          >
            <option value="">Default (all programs)</option>
            {courses.filter((c) => c.active).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-muted">
          Flow
          <select
            className="input-field mt-1 min-w-[200px]"
            value={triggerKey}
            onChange={(e) => setTriggerKey(e.target.value)}
          >
            {triggerRules.map((r) => (
              <option key={r.trigger_key} value={r.trigger_key}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-3">
        {steps.map((step, i) => (
          <div key={i} className="rounded-xl border border-border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-eyebrow text-muted">
                Step {i + 1}
              </p>
              <div className="flex gap-1">
                <button type="button" className="btn-ghost text-xs" onClick={() => move(i, -1)}>
                  Up
                </button>
                <button type="button" className="btn-ghost text-xs" onClick={() => move(i, 1)}>
                  Down
                </button>
                <button
                  type="button"
                  className="btn-ghost text-xs text-danger"
                  onClick={() => setSteps((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  Remove
                </button>
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-semibold text-muted">
                Channel
                <select
                  className="input-field mt-1"
                  value={step.channel}
                  onChange={(e) =>
                    setSteps((prev) =>
                      prev.map((s, idx) =>
                        idx === i
                          ? { ...s, channel: e.target.value as "whatsapp" | "email" }
                          : s
                      )
                    )
                  }
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-muted">
                Delay (hours)
                <input
                  type="number"
                  min={0}
                  className="input-field mt-1"
                  value={step.delay_hours}
                  onChange={(e) =>
                    setSteps((prev) =>
                      prev.map((s, idx) =>
                        idx === i ? { ...s, delay_hours: Number(e.target.value) } : s
                      )
                    )
                  }
                />
              </label>
            </div>
            {step.channel === "whatsapp" ? (
              <label className="mt-3 block text-xs font-semibold text-muted">
                WhatsApp template name
                <input
                  className="input-field mt-1"
                  value={step.wa_template_name}
                  onChange={(e) =>
                    setSteps((prev) =>
                      prev.map((s, idx) =>
                        idx === i ? { ...s, wa_template_name: e.target.value } : s
                      )
                    )
                  }
                />
              </label>
            ) : (
              <>
                <label className="mt-3 block text-xs font-semibold text-muted">
                  Email subject
                  <input
                    className="input-field mt-1"
                    value={step.email_subject}
                    onChange={(e) =>
                      setSteps((prev) =>
                        prev.map((s, idx) =>
                          idx === i ? { ...s, email_subject: e.target.value } : s
                        )
                      )
                    }
                  />
                </label>
                <label className="mt-3 block text-xs font-semibold text-muted">
                  Email body
                  <textarea
                    className="input-field mt-1 min-h-[100px]"
                    value={step.email_body_html}
                    onChange={(e) =>
                      setSteps((prev) =>
                        prev.map((s, idx) =>
                          idx === i ? { ...s, email_body_html: e.target.value } : s
                        )
                      )
                    }
                  />
                </label>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-navy"
          onClick={() =>
            setSteps((prev) => [
              ...prev,
              {
                channel: "whatsapp",
                delay_hours: 0,
                wa_template_name: "",
                email_subject: "",
                email_body_html: "",
              },
            ])
          }
        >
          Add message
        </button>
        <button
          type="button"
          className="btn-primary text-xs"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const upserted = await upsertMessageSequence({
                id: matching && (matching.course_id ?? "") === (courseId || "") ? matching.id : undefined,
                trigger_key: triggerKey,
                course_id: courseId || null,
                label: triggerRules.find((r) => r.trigger_key === triggerKey)?.label,
              });
              if (!upserted.ok || !upserted.id) {
                setMsg(upserted.ok ? "Missing id" : upserted.error ?? "Error");
                return;
              }
              const res = await saveSequenceSteps(
                upserted.id,
                steps.map((s) => ({
                  channel: s.channel,
                  delay_hours: s.delay_hours,
                  wa_template_name: s.wa_template_name || null,
                  email_subject: s.email_subject || null,
                  email_body_html: s.email_body_html || null,
                }))
              );
              setMsg(res.ok ? "Sequence saved" : res.error ?? "Error");
              router.refresh();
            })
          }
        >
          Save sequence
        </button>
        {matching && matching.course_id ? (
          <button
            type="button"
            className="btn-ghost text-xs text-danger"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await deleteMessageSequence(matching.id);
                setMsg(res.ok ? "Override removed" : res.error ?? "Error");
                router.refresh();
              })
            }
          >
            Remove program override
          </button>
        ) : null}
      </div>
    </div>
  );
}
