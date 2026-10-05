"use client";

import { useEffect, useState } from "react";
import { fetchLeadScoreHistory, type LeadScoreHistoryRow } from "@/app/actions/scores";
import { formatDateTime } from "@/lib/utils";

export type LeadQualityFields = {
  lead_quality?: number | null;
  counselor_intent?: number | null;
  counselor_comms?: number | null;
  counselor_profile?: number | null;
  panel_intent?: number | null;
  panel_profile?: number | null;
  panel_round?: string | null;
};

/** "LQ 11/15 · I4 C3 P4" plus the latest panel score beside it (never mixed). */
export function LeadQualityBadge({ lead, compact = false }: { lead: LeadQualityFields; compact?: boolean }) {
  const hasCounselor = lead.counselor_intent != null;
  const hasPanel = lead.panel_intent != null;
  if (!hasCounselor && !hasPanel) return compact ? null : <span className="text-muted">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {hasCounselor ? (
        <span
          className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-2 py-0.5 text-[11px] font-semibold text-navy"
          title="Counselor score: Intent · Comms · Profile (each 1–5)"
        >
          <span className="tabular-nums">{lead.lead_quality != null ? `${lead.lead_quality}/15` : "—/15"}</span>
          <span className="font-normal text-muted">
            I{lead.counselor_intent ?? "–"} C{lead.counselor_comms ?? "–"} P{lead.counselor_profile ?? "–"}
          </span>
        </span>
      ) : null}
      {hasPanel ? (
        <span
          className="inline-flex items-center gap-1 rounded-full border border-periwinkle/40 bg-periwinkle/5 px-2 py-0.5 text-[11px] font-semibold text-navy"
          title="Latest panelist score: Intent · Profile (each 1–5)"
        >
          Panel {lead.panel_round ?? ""}
          <span className="font-normal text-muted">
            I{lead.panel_intent} P{lead.panel_profile ?? "–"}
          </span>
        </span>
      ) : null}
    </span>
  );
}

const CONTEXT_LABEL: Record<string, string> = {
  call: "Counselor · call",
  admission_r1: "Counselor · R1 booking",
  manual_intent: "Counselor · intent update",
  stage_advance: "Counselor · stage move",
  panel_r1: "Panel · R1",
  panel_r2: "Panel · R2",
  panel_r3: "Panel · R3",
};

/** Lead Quality on the lead page: latest counselor + panel scores, then every score per round. */
export function LeadQualityCard({ leadId, lead }: { leadId: string; lead: LeadQualityFields }) {
  const [rows, setRows] = useState<LeadScoreHistoryRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetchLeadScoreHistory(leadId)
      .then((r) => alive && setRows(r))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [leadId, lead.lead_quality, lead.panel_intent, lead.counselor_intent]);

  // Profile per round: the latest score given in each round
  const rounds = (["R1", "R2", "R3"] as const).map((round) => {
    const panel = rows?.find((r) => r.context === `panel_${round.toLowerCase()}`);
    return { round, panel };
  });

  return (
    <section className="panel px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">Lead quality</p>
            <p className="text-2xl font-semibold tabular-nums text-navy">
              {lead.lead_quality != null ? `${lead.lead_quality}/15` : "—"}
            </p>
          </div>
          {(
            [
              ["Intent", lead.counselor_intent],
              ["Comms", lead.counselor_comms],
              ["Profile", lead.counselor_profile],
            ] as const
          ).map(([label, v]) => (
            <div key={label}>
              <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">{label}</p>
              <p className="text-lg font-semibold tabular-nums text-navy">{v != null ? `${v}/5` : "—"}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted">
          Counselor scores on nurturing / R1 booked calls · panel scores shown separately
        </p>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {rounds.map(({ round, panel }) => (
          <div key={round} className="rounded-xl border border-border bg-[#F7F8FC] px-3 py-2 text-sm">
            <p className="text-[10px] font-semibold uppercase tracking-eyebrow text-muted">Panel · {round}</p>
            {panel ? (
              <p className="font-medium text-navy">
                Intent {panel.intent}/5 · Profile {panel.profile}/5
                {panel.scorer ? <span className="text-xs font-normal text-muted"> · {panel.scorer}</span> : null}
              </p>
            ) : (
              <p className="text-muted">Not scored</p>
            )}
          </div>
        ))}
      </div>

      {rows && rows.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-navy">All scores ({rows.length})</summary>
          <table className="mt-2 w-full text-left text-xs">
            <thead className="text-muted">
              <tr>
                <th className="py-1 pr-3">When</th>
                <th className="py-1 pr-3">Given by</th>
                <th className="py-1 pr-3">Intent</th>
                <th className="py-1 pr-3">Comms</th>
                <th className="py-1 pr-3">Profile</th>
                <th className="py-1 pr-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="py-1 pr-3">{formatDateTime(r.createdAt)}</td>
                  <td className="py-1 pr-3">
                    {CONTEXT_LABEL[r.context] ?? r.context}
                    {r.scorer ? <span className="text-muted"> · {r.scorer}</span> : null}
                  </td>
                  <td className="py-1 pr-3">{r.intent}</td>
                  <td className="py-1 pr-3">{r.comms ?? "—"}</td>
                  <td className="py-1 pr-3">{r.profile}</td>
                  <td className="py-1 pr-3">{r.comms != null ? `${r.intent + r.comms + r.profile}/15` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
    </section>
  );
}
