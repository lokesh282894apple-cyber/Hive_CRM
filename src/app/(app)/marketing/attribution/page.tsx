import { requireUser } from "@/lib/auth";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import {
  fetchAttributionReport,
  formatInr,
  parseMarketingFilters,
} from "@/lib/marketing/dashboard-queries";

export default async function MarketingAttributionPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  await requireUser(["admin", "marketing"]);
  const filters = parseMarketingFilters(searchParams);
  const model = searchParams.model === "last" ? "last" : "first";
  const rows = await fetchAttributionReport(filters, model);

  return (
    <MarketingPageShell
      title="Attribution"
      description="UTM source × medium × campaign — first / last touch"
      basePath="/marketing/attribution"
      section="leads"
    >
      <section className="panel overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b border-border bg-navy/[0.02]">
            <tr>
              <th className="eyebrow px-3 py-2">Source</th>
              <th className="eyebrow px-3 py-2">Medium</th>
              <th className="eyebrow px-3 py-2">Campaign</th>
              <th className="eyebrow px-3 py-2">Leads</th>
              <th className="eyebrow px-3 py-2">AQL</th>
              <th className="eyebrow px-3 py-2">R1+</th>
              <th className="eyebrow px-3 py-2">Enrolled</th>
              <th className="eyebrow px-3 py-2">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border last:border-0">
                <td className="px-3 py-2">{r.utmSource ?? "direct"}</td>
                <td className="px-3 py-2">{r.utmMedium ?? "—"}</td>
                <td className="px-3 py-2 max-w-[180px] truncate">{r.utmCampaign ?? "—"}</td>
                <td className="px-3 py-2 font-medium">{r.leads}</td>
                <td className="px-3 py-2">{r.aql}</td>
                <td className="px-3 py-2">{r.r1}</td>
                <td className="px-3 py-2">{r.enrolled}</td>
                <td className="px-3 py-2">{formatInr(r.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </MarketingPageShell>
  );
}
