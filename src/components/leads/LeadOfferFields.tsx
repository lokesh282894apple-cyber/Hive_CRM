"use client";

import { updateLeadCardFields } from "@/app/actions/leads";
import { recordStudentIntentScore } from "@/app/actions/scores";
import {
  CONVERT_PROBABILITIES,
  CONVERT_PROBABILITY_LABELS,
  OFFER_CALL_STATUSES,
  OFFER_CALL_STATUS_LABELS,
  type ConvertProbability,
  type OfferCallStatus,
} from "@/lib/constants";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type OfferLead = {
  id: string;
  stage: string;
  avg_student_intent?: number | null;
  convert_probability?: ConvertProbability | null;
  offer_call_status?: OfferCallStatus | null;
  offer_accept_deadline?: string | null;
};

export function LeadOfferFields({
  lead,
  compact = false,
}: {
  lead: OfferLead;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [intentPick, setIntentPick] = useState<number | "">("");
  const isOffer =
    lead.stage === "offered" ||
    lead.stage === "yet_to_offer" ||
    lead.stage === "offered_accepted";

  function save(patch: Parameters<typeof updateLeadCardFields>[1]) {
    startTransition(async () => {
      await updateLeadCardFields(lead.id, patch);
      router.refresh();
    });
  }

  const avg =
    lead.avg_student_intent != null
      ? Number(lead.avg_student_intent).toFixed(1)
      : null;

  return (
    <div
      className={
        compact
          ? "mt-2 space-y-1.5"
          : "mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      }
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={
          compact ? "text-[11px] text-muted" : "text-xs font-semibold text-muted"
        }
      >
        Avg student intent
        <p className="mt-1 text-sm font-semibold text-navy">
          {avg != null ? `${avg}/5` : "—"}
        </p>
        <label className="mt-1 block text-[10px] font-normal text-muted">
          Add score
          <select
            className="input-field mt-0.5 py-1 text-xs"
            value={intentPick === "" ? "" : String(intentPick)}
            disabled={pending}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : "";
              setIntentPick(v);
              if (v === "") return;
              startTransition(async () => {
                const res = await recordStudentIntentScore({
                  leadId: lead.id,
                  intentScore: v,
                  context: "manual_intent",
                });
                if (res.ok) {
                  setIntentPick("");
                  router.refresh();
                }
              });
            }}
          >
            <option value="">1–5</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      {isOffer ? (
        <>
          <label
            className={
              compact
                ? "block text-[11px] text-muted"
                : "text-xs font-semibold text-muted"
            }
          >
            Post-offer call
            <select
              className="input-field mt-1 py-1.5 text-xs"
              value={lead.offer_call_status ?? "not_booked"}
              disabled={pending}
              onChange={(e) =>
                save({ offer_call_status: e.target.value as OfferCallStatus })
              }
            >
              {OFFER_CALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {OFFER_CALL_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label
            className={
              compact
                ? "block text-[11px] text-muted"
                : "text-xs font-semibold text-muted"
            }
          >
            Convert probability
            <select
              className="input-field mt-1 py-1.5 text-xs"
              value={lead.convert_probability ?? ""}
              disabled={pending}
              onChange={(e) =>
                save({
                  convert_probability: (e.target.value ||
                    null) as ConvertProbability | null,
                })
              }
            >
              <option value="">—</option>
              {CONVERT_PROBABILITIES.map((s) => (
                <option key={s} value={s}>
                  {CONVERT_PROBABILITY_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label
            className={
              compact
                ? "block text-[11px] text-muted"
                : "text-xs font-semibold text-muted"
            }
          >
            Accept deadline
            <input
              type="date"
              className="input-field mt-1 py-1.5 text-xs"
              defaultValue={lead.offer_accept_deadline?.slice(0, 10) ?? ""}
              disabled={pending}
              onBlur={(e) => {
                const next = e.target.value || null;
                if (
                  next !== (lead.offer_accept_deadline?.slice(0, 10) ?? null)
                ) {
                  save({ offer_accept_deadline: next });
                }
              }}
            />
          </label>
        </>
      ) : null}
    </div>
  );
}
