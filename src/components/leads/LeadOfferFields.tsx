"use client";

import { updateLeadCardFields } from "@/app/actions/leads";
import {
  CONVERT_PROBABILITIES,
  CONVERT_PROBABILITY_LABELS,
  OFFER_CALL_STATUSES,
  OFFER_CALL_STATUS_LABELS,
  type ConvertProbability,
  type OfferCallStatus,
} from "@/lib/constants";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

type OfferLead = {
  id: string;
  stage: string;
  counselor_intent_check?: string | null;
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
  const [intent, setIntent] = useState(lead.counselor_intent_check ?? "");
  const isOffer = lead.stage === "offered" || lead.stage === "yet_to_offer";

  useEffect(() => {
    setIntent(lead.counselor_intent_check ?? "");
  }, [lead.id, lead.counselor_intent_check]);

  function save(patch: Parameters<typeof updateLeadCardFields>[1]) {
    startTransition(async () => {
      await updateLeadCardFields(lead.id, patch);
      router.refresh();
    });
  }

  return (
    <div
      className={compact ? "mt-2 space-y-1.5" : "mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <label className={compact ? "block text-[11px] text-muted" : "text-xs font-semibold text-muted"}>
        Counselor intent
        <input
          className="input-field mt-1 py-1.5 text-xs"
          value={intent}
          disabled={pending}
          placeholder="Tag or note"
          onChange={(e) => setIntent(e.target.value)}
          onBlur={() => {
            const next = intent.trim() || null;
            if (next !== (lead.counselor_intent_check ?? null)) {
              save({ counselor_intent_check: next });
            }
          }}
        />
      </label>
      {isOffer ? (
        <>
          <label className={compact ? "block text-[11px] text-muted" : "text-xs font-semibold text-muted"}>
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
          <label className={compact ? "block text-[11px] text-muted" : "text-xs font-semibold text-muted"}>
            Convert probability
            <select
              className="input-field mt-1 py-1.5 text-xs"
              value={lead.convert_probability ?? ""}
              disabled={pending}
              onChange={(e) =>
                save({
                  convert_probability: (e.target.value || null) as ConvertProbability | null,
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
          <label className={compact ? "block text-[11px] text-muted" : "text-xs font-semibold text-muted"}>
            Accept deadline
            <input
              type="date"
              className="input-field mt-1 py-1.5 text-xs"
              defaultValue={lead.offer_accept_deadline?.slice(0, 10) ?? ""}
              disabled={pending}
              onBlur={(e) => {
                const next = e.target.value || null;
                if (next !== (lead.offer_accept_deadline?.slice(0, 10) ?? null)) {
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
