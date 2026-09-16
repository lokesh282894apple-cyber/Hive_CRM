import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Primitives";
import { fetchAdmissionsMonthlyRollup } from "@/lib/analytics/admissions";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";

export default async function AdminMonthlyPage() {
  await requireUser(["admin"]);
  const supabase = createClient();
  const rows = await fetchAdmissionsMonthlyRollup(supabase, 18);

  return (
    <div className="space-y-6">
      <PageHeader
        title="All months"
        description="Year-at-a-glance admissions rollup — cohort leads, available pipeline, converts, revenue"
      />

      <section className="panel overflow-x-auto">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
            All months
          </p>
          <Link href="/admin/analytics" className="text-xs font-semibold text-periwinkle">
            Admission Analytics →
          </Link>
        </div>
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-border bg-navy/[0.02]">
            <tr>
              <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                Month
              </th>
              <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                Status
              </th>
              <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                Leads
              </th>
              <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                Available
              </th>
              <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                R1
              </th>
              <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                Converts
              </th>
              <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                Lost
              </th>
              <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                Rev booked
              </th>
              <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                Rev realized
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.monthKey}
                className={`border-b border-border last:border-0 ${r.status === "live" ? "bg-amber-50/80" : ""}`}
              >
                <td className="px-3 py-2 font-medium text-navy">{r.monthKey}</td>
                <td className="px-3 py-2 text-xs uppercase text-muted">{r.status}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.leads}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.availableLeads}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.r1Booked}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.converts}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.lost}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatCurrency(r.revenueBooked)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatCurrency(r.revenueRealized)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 py-3 text-xs text-muted">
          Available = leads created that month still open in pipeline (not converted, deferred, or
          refunded).
        </p>
      </section>
    </div>
  );
}
