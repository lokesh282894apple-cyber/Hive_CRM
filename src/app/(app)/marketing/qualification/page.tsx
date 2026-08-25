import { requireUser } from "@/lib/auth";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { DQ_REASON_LABELS } from "@/lib/marketing/aql";
import {
  aggregateDqReasons,
  fetchQualificationLeads,
  parseMarketingFilters,
} from "@/lib/marketing/dashboard-queries";
import Link from "next/link";

export default async function MarketingQualificationPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  await requireUser(["admin", "marketing", "counselor"]);
  const filters = parseMarketingFilters(searchParams);
  const leads = await fetchQualificationLeads(filters);
  const dq = aggregateDqReasons(leads);

  return (
    <MarketingPageShell
      title="Lead qualification"
      description="AQL (Acceptance Quality Limit) — intent + financial check · DQ reason funnel"
      basePath="/marketing/qualification"
      section="leads"
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="panel p-4 lg:col-span-1">
          <p className="eyebrow mb-3">Disqualification reasons</p>
          {dq.length === 0 ? (
            <p className="text-sm text-muted">No DQ reasons in range.</p>
          ) : (
            <ul className="space-y-2">
              {dq.map((d) => (
                <li key={d.reason} className="flex justify-between text-sm">
                  <span>{DQ_REASON_LABELS[d.reason as keyof typeof DQ_REASON_LABELS] ?? d.reason}</span>
                  <span className="text-muted">{d.count} ({d.pct.toFixed(0)}%)</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel overflow-x-auto lg:col-span-2">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-navy/[0.02]">
              <tr>
                <th className="eyebrow px-3 py-2">Lead</th>
                <th className="eyebrow px-3 py-2">Date</th>
                <th className="eyebrow px-3 py-2">Intent</th>
                <th className="eyebrow px-3 py-2">Financial</th>
                <th className="eyebrow px-3 py-2">AQL</th>
                <th className="eyebrow px-3 py-2">Campaign</th>
                <th className="eyebrow px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <Link href={`/leads/${l.id}`} className="font-medium text-navy hover:underline">
                      {l.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-muted">{l.leadDate}</td>
                  <td className="px-3 py-2 capitalize">{l.intent ?? "—"}</td>
                  <td className="px-3 py-2 capitalize">{l.financialCheck ?? "—"}</td>
                  <td className="px-3 py-2">{l.aqlAt ? "✓" : "—"}</td>
                  <td className="px-3 py-2 max-w-[140px] truncate text-muted">{l.campaign ?? "—"}</td>
                  <td className="px-3 py-2 text-muted">{l.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </MarketingPageShell>
  );
}
