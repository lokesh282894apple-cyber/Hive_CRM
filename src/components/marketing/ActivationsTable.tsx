"use client";

import { updateActivationStatus } from "@/app/actions/marketing-dashboard";
import { formatInr } from "@/lib/marketing/metrics";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

type ActivationRow = {
  id: string;
  activity: string;
  activity_type: string | null;
  channel: string | null;
  attribution_token: string | null;
  attribution_window_days: number | null;
  owner: string | null;
  planned_date: string | null;
  money_deployed_inr: number | null;
  status: string;
  detailed_notes: string | null;
  attributed_leads_count: number | null;
};

export function ActivationsTable({ rows }: { rows: ActivationRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function markDone(id: string) {
    start(async () => {
      await updateActivationStatus(id, "done");
      router.refresh();
    });
  }

  return (
    <table className="w-full min-w-[1100px] text-left text-sm">
      <thead className="border-b border-border bg-navy/[0.02]">
        <tr>
          <th className="eyebrow px-3 py-2">Activity</th>
          <th className="eyebrow px-3 py-2">Channel</th>
          <th className="eyebrow px-3 py-2">Token</th>
          <th className="eyebrow px-3 py-2">Owner</th>
          <th className="eyebrow px-3 py-2">Go-live</th>
          <th className="eyebrow px-3 py-2">Money</th>
          <th className="eyebrow px-3 py-2">Status</th>
          <th className="eyebrow px-3 py-2 text-right">Leads (Simer)</th>
          <th className="eyebrow px-3 py-2">Notes</th>
          <th className="eyebrow px-3 py-2" />
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => (
          <tr key={a.id} className="border-b border-border">
            <td className="px-3 py-2">
              <div className="font-medium text-navy">{a.activity}</div>
              <div className="text-[11px] text-muted">{a.activity_type ?? "—"}</div>
            </td>
            <td className="px-3 py-2 text-muted">{a.channel ?? "—"}</td>
            <td className="px-3 py-2 font-mono text-[11px] text-muted">
              {a.attribution_token ?? "—"}
            </td>
            <td className="px-3 py-2 text-muted">{a.owner ?? "—"}</td>
            <td className="px-3 py-2">{a.planned_date ?? "—"}</td>
            <td className="px-3 py-2">
              {a.money_deployed_inr != null
                ? formatInr(Number(a.money_deployed_inr))
                : "—"}
            </td>
            <td className="px-3 py-2 capitalize">{a.status}</td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold text-navy">
              {a.attributed_leads_count ?? 0}
              {a.attribution_window_days ? (
                <span className="ml-1 text-[10px] font-normal text-muted">
                  /{a.attribution_window_days}d
                </span>
              ) : null}
            </td>
            <td className="max-w-[180px] truncate px-3 py-2 text-muted">
              {a.detailed_notes ?? "—"}
            </td>
            <td className="px-3 py-2">
              {a.status !== "done" ? (
                <button
                  type="button"
                  className="text-[11px] font-semibold text-periwinkle"
                  disabled={pending}
                  onClick={() => markDone(a.id)}
                >
                  Mark done
                </button>
              ) : (
                <span className="text-[11px] text-emerald-700">Attributed</span>
              )}
            </td>
          </tr>
        ))}
        {!rows.length && (
          <tr>
            <td colSpan={10} className="px-3 py-6 text-muted">
              No activations yet — add influencer / WA / LinkedIn pushes above. Mark{" "}
              <strong>done</strong> to auto-pick matching leads.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
