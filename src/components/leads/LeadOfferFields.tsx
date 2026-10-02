"use client";

import { updateLeadCardFields } from "@/app/actions/leads";
import { LeadQualityBadge, type LeadQualityFields } from "@/components/leads/LeadQuality";
import {
  CONVERT_PROBABILITIES,
  CONVERT_PROBABILITY_LABELS,
  OFFER_CALL_STATUSES,
  OFFER_CALL_STATUS_LABELS,
  type ConvertProbability,
  type OfferCallStatus,
} from "@/lib/constants";
import { useTransition } from "react";

type OfferLead = LeadQualityFields & {
  id: string;
  stage: string;
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
  const [pending, startTransition] = useTransition();
  const isOffer =
    lead.stage === "offered" ||
    lead.stage === "yet_to_offer" ||
    lead.stage === "offered_accepted";

  function save(patch: Parameters<typeof updateLeadCardFields>[1]) {
    startTransition(async () => {
      await updateLeadCardFields(lead.id, patch);
    });
  }

  // Board cards show Lead Quality in the card header; only offer fields here
  if (compact && !isOffer) return null;

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
      {!compact ? (
        <div className="text-xs font-semibold text-muted">
          Lead quality
          <div className="mt-1">
            <LeadQualityBadge lead={lead} />
          </div>
        </div>
      ) : null}
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
