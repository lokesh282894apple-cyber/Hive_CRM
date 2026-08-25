import { requireUser } from "@/lib/auth";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { CsvUploadPanel } from "@/components/marketing/CsvUploadPanel";
import {
  fetchAdInsights,
  formatInr,
  formatPct,
  parseMarketingFilters,
} from "@/lib/marketing/dashboard-queries";

export default async function MarketingAdsPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  await requireUser(["admin", "marketing"]);
  const filters = parseMarketingFilters(searchParams);
  const rows = await fetchAdInsights(filters);

  return (
    <MarketingPageShell
      title="Meta ad performance"
      description="Ad-level — hybrid API sync + CSV upload (PGP offline meta ads tab)"
      basePath="/marketing/ads"
      section="performance"
      showOrganic={false}
      extra={<CsvUploadPanel />}
    >
      <section className="panel overflow-x-auto">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="border-b border-border bg-navy/[0.02]">
            <tr>
              <th className="eyebrow px-3 py-2">Week</th>
              <th className="eyebrow px-3 py-2">Campaign</th>
              <th className="eyebrow px-3 py-2">Ad</th>
              <th className="eyebrow px-3 py-2">Spend</th>
              <th className="eyebrow px-3 py-2">Results</th>
              <th className="eyebrow px-3 py-2">Cost/result</th>
              <th className="eyebrow px-3 py-2">CTR</th>
              <th className="eyebrow px-3 py-2">CPC</th>
              <th className="eyebrow px-3 py-2">Hook rate</th>
              <th className="eyebrow px-3 py-2">Flag</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={`border-b border-border last:border-0 ${r.needsReview ? "bg-amber-50" : ""}`}
              >
                <td className="px-3 py-2">{r.weekLabel}</td>
                <td className="px-3 py-2 max-w-[160px] truncate">{r.campaignName}</td>
                <td className="px-3 py-2 max-w-[160px] truncate">{r.adName}</td>
                <td className="px-3 py-2">{formatInr(r.spend)}</td>
                <td className="px-3 py-2">{r.results}</td>
                <td className="px-3 py-2">{formatInr(r.costPerResult)}</td>
                <td className="px-3 py-2">{formatPct(r.ctr)}</td>
                <td className="px-3 py-2">{formatInr(r.cpc)}</td>
                <td className="px-3 py-2">{formatPct(r.hookRate)}</td>
                <td className="px-3 py-2 text-amber-700">{r.needsReview ? "Review" : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-muted">
                  No ad insights — connect Meta or upload weekly CSV.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </MarketingPageShell>
  );
}
