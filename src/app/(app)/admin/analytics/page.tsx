import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard } from "@/components/ui/Primitives";
import { STAGE_LABELS, type Stage } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";

export default async function AdminAnalyticsPage() {
  await requireUser(["admin"]);
  const supabase = createClient();

  const [{ data: leads }, { data: loans }, { data: vendors }, { data: feeRecords }] =
    await Promise.all([
      supabase.from("leads").select("id, stage, created_at"),
      supabase.from("loans").select("stage, loan_vendor_id, amount_realised, total_fee"),
      supabase.from("loan_vendors").select("id, name"),
      supabase.from("fee_records").select("total_fee, remaining_fee, payment_mode"),
    ]);

  const all = leads ?? [];
  const stageCounts = all.reduce<Record<string, number>>((acc, l) => {
    acc[l.stage] = (acc[l.stage] ?? 0) + 1;
    return acc;
  }, {});

  const sentOrLater = (loans ?? []).filter((l) =>
    ["sent_to_vendor", "approved", "disbursed_pending", "disbursed_hit_bank"].includes(l.stage)
  );
  const approvedOrLater = (loans ?? []).filter((l) =>
    ["approved", "disbursed_pending", "disbursed_hit_bank"].includes(l.stage)
  );

  const vendorStats = (vendors ?? []).map((v) => {
    const sent = sentOrLater.filter((l) => l.loan_vendor_id === v.id).length;
    const approved = approvedOrLater.filter((l) => l.loan_vendor_id === v.id).length;
    return {
      name: v.name,
      sent,
      approved,
      rate: sent ? Math.round((approved / sent) * 100) : 0,
    };
  });

  const collected = (feeRecords ?? []).reduce(
    (s, f) => s + (Number(f.total_fee) - Number(f.remaining_fee)),
    0
  );
  const outstanding = (feeRecords ?? []).reduce((s, f) => s + Number(f.remaining_fee), 0);

  return (
    <div>
      <PageHeader
        eyebrow="Admin · Analytics"
        title="Funnel &"
        accent="Collection"
        description="Conversion snapshot, loan approval by vendor, and fee collection totals."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Leads in funnel" value={all.length} />
        <StatCard label="Fee collected" value={formatCurrency(collected)} />
        <StatCard label="Fee outstanding" value={formatCurrency(outstanding)} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <p className="eyebrow">Funnel conversion</p>
          <ul className="mt-4 max-h-96 space-y-1 overflow-y-auto">
            {Object.entries(stageCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([stage, n]) => (
                <li key={stage} className="flex justify-between text-sm">
                  <span>{STAGE_LABELS[stage as Stage] ?? stage}</span>
                  <span className="font-semibold text-periwinkle">{n}</span>
                </li>
              ))}
          </ul>
        </section>

        <section className="panel p-5">
          <p className="eyebrow">Loan approval by vendor</p>
          <p className="mt-1 text-xs text-muted">
            Approval rate = reached approved+ / sent to that vendor.
          </p>
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="eyebrow py-2">Vendor</th>
                <th className="eyebrow py-2">Sent</th>
                <th className="eyebrow py-2">Approved+</th>
                <th className="eyebrow py-2">Rate</th>
              </tr>
            </thead>
            <tbody>
              {vendorStats.map((v) => (
                <tr key={v.name} className="border-b border-border last:border-0">
                  <td className="py-2">{v.name}</td>
                  <td className="py-2">{v.sent}</td>
                  <td className="py-2">{v.approved}</td>
                  <td className="py-2 font-semibold text-periwinkle">{v.rate}%</td>
                </tr>
              ))}
              {vendorStats.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-muted">
                    No vendors yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
