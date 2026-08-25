import { requireUser } from "@/lib/auth";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import {
  fetchCampaignRoi,
  formatInr,
  formatPct,
  parseMarketingFilters,
} from "@/lib/marketing/dashboard-queries";

export default async function MarketingRoiPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  await requireUser(["admin", "marketing"]);
  const filters = parseMarketingFilters(searchParams);
  const rows = await fetchCampaignRoi(filters);

  return (
    <MarketingPageShell
      title="Campaign ROI"
      description="Spend → leads → AQL → enrolments → revenue realised"
      basePath="/marketing/roi"
      section="leads"
    >
      <section className="panel overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-border bg-navy/[0.02]">
            <tr>
              <th className="eyebrow px-3 py-2">Campaign</th>
              <th className="eyebrow px-3 py-2">Channel</th>
              <th className="eyebrow px-3 py-2">Spend</th>
              <th className="eyebrow px-3 py-2">Leads</th>
              <th className="eyebrow px-3 py-2">AQL</th>
              <th className="eyebrow px-3 py-2">R1</th>
              <th className="eyebrow px-3 py-2">Enrolled</th>
              <th className="eyebrow px-3 py-2">Revenue</th>
              <th className="eyebrow px-3 py-2">ROAS</th>
              <th className="eyebrow px-3 py-2">ROI %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.campaignId ?? r.campaignName} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-medium">{r.campaignName}</td>
                <td className="px-3 py-2 text-muted">{r.channel ?? "—"}</td>
                <td className="px-3 py-2">{formatInr(r.spend)}</td>
                <td className="px-3 py-2">{r.leads}</td>
                <td className="px-3 py-2">{r.aql}</td>
                <td className="px-3 py-2">{r.r1Booked}</td>
                <td className="px-3 py-2">{r.enrolments}</td>
                <td className="px-3 py-2">{formatInr(r.revenue)}</td>
                <td className="px-3 py-2">{r.roas?.toFixed(2) ?? "—"}</td>
                <td className="px-3 py-2">{formatPct(r.roiPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </MarketingPageShell>
  );
}
