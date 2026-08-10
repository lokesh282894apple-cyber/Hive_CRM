import { requireUser } from "@/lib/auth";
import { evaluateAttentionReasons } from "@/lib/attention";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StageBadge } from "@/components/ui/Primitives";
import type { Stage } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

export default async function AttentionPage() {
  const user = await requireUser(["counselor", "admin"]);
  const supabase = createClient();

  const [{ data: settings }, { data: leads }, { data: overdueInst }] = await Promise.all([
    supabase.from("app_settings").select("*"),
    user.role === "admin"
      ? supabase.from("leads").select("id, name, stage, last_contacted_at, created_at").limit(500)
      : supabase
          .from("leads")
          .select("id, name, stage, last_contacted_at, created_at")
          .eq("lead_allocated_to", user.id)
          .limit(500),
    supabase
      .from("installments")
      .select("fee_record_id, fee_records(lead_id)")
      .eq("status", "overdue"),
  ]);

  const map = Object.fromEntries((settings ?? []).map((s) => [s.key, s.value]));
  const noContactDaysThreshold = Number(map.attention_no_contact_days ?? 3);
  const unresolvedNoshowDays = Number(map.attention_unresolved_noshow_days ?? 2);

  const overdueLeadIds = new Set(
    (overdueInst ?? [])
      .map((r) => {
        const fr = r.fee_records as unknown as { lead_id: string } | null;
        return fr?.lead_id;
      })
      .filter(Boolean) as string[]
  );

  const flagged = (leads ?? [])
    .map((lead) => ({
      lead,
      reasons: evaluateAttentionReasons(lead, {
        noContactDays: noContactDaysThreshold,
        unresolvedNoshowDays,
        overdueLeadIds,
      }),
    }))
    .filter((row) => row.reasons.length > 0);

  return (
    <div>
      <PageHeader
        eyebrow="Needs immediate attention"
        title="Attention"
        accent="Board"
        description="Provisional rule set — triggers are configurable placeholders until the client finalizes criteria."
      />
      <div className="mb-4 rounded-panel border border-warning/30 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
        Rules shipped for prototype: overdue installment, no contact in N days (default{" "}
        {noContactDaysThreshold}), unresolved no-show after X days (default {unresolvedNoshowDays}
        ). Edit thresholds in System Config / app_settings.
      </div>
      <div className="panel overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-navy/[0.02]">
            <tr>
              <th className="eyebrow px-4 py-3">Lead</th>
              <th className="eyebrow px-4 py-3">Stage</th>
              <th className="eyebrow px-4 py-3">Triggers</th>
              <th className="eyebrow px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {flagged.map(({ lead, reasons }) => (
              <tr key={lead.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <Link
                    href={`/leads/${lead.id}`}
                    className="font-medium text-navy hover:text-periwinkle"
                  >
                    {lead.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <StageBadge stage={lead.stage as Stage} />
                </td>
                <td className="px-4 py-3 text-muted">
                  <ul className="list-disc pl-4">
                    {reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </td>
                <td className="px-4 py-3 text-muted">{formatDate(lead.created_at)}</td>
              </tr>
            ))}
            {flagged.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted">
                  No leads match provisional attention rules.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
