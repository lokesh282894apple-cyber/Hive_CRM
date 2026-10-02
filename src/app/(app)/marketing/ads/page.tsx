import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { CsvUploadPanel } from "@/components/marketing/CsvUploadPanel";
import {
  fetchAdInsights,
  fetchMetaAdPerformance,
  formatInr,
  formatPct,
  parseMarketingFilters,
  type MetaAdGroupBy,
} from "@/lib/marketing/dashboard-queries";
import { istDateKey, istTime } from "@/lib/tz";

// Cold aggregates can take several seconds on a small DB — finish and fill
// the cache instead of hitting the default function timeout.
export const maxDuration = 60;

const GROUPS: { id: MetaAdGroupBy; label: string }[] = [
  { id: "ad", label: "Ads" },
  { id: "adset", label: "Ad sets" },
  { id: "campaign", label: "Campaigns" },
];

const num = (n: number) => n.toLocaleString("en-IN");

export default async function MarketingAdsPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  await requireUser(["admin", "marketing"]);
  const filters = parseMarketingFilters(searchParams);
  const groupBy: MetaAdGroupBy =
    searchParams.group === "campaign" || searchParams.group === "adset" ? searchParams.group : "ad";
  const [perf, csvRows] = await Promise.all([
    fetchMetaAdPerformance(filters, groupBy),
    fetchAdInsights(filters),
  ]);
  const { rows, totals } = perf;

  const hrefFor = (g: MetaAdGroupBy) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (v) sp.set(k, v);
    if (g === "ad") sp.delete("group");
    else sp.set("group", g);
    const q = sp.toString();
    return `/marketing/ads${q ? `?${q}` : ""}`;
  };

  const showAd = groupBy === "ad";
  const showSet = groupBy !== "campaign";

  return (
    <MarketingPageShell
      title="Meta ad performance"
      description="Meta API — every ad, every day, summed for the chosen dates. Hook rate = 3-second plays ÷ impressions."
      basePath="/marketing/ads"
      section="performance"
      showOrganic={false}
      extra={<CsvUploadPanel />}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          {GROUPS.map((g) => (
            <Link
              key={g.id}
              href={hrefFor(g.id)}
              className={g.id === groupBy ? "btn-primary !py-1.5" : "btn-ghost !py-1.5"}
            >
              {g.label}
            </Link>
          ))}
        </div>
        <p className="text-xs text-muted">
          {perf.lastSyncedAt ? `Last synced ${istDateKey(perf.lastSyncedAt)} ${istTime(perf.lastSyncedAt)} IST` : "Not synced yet"}
          {" · "}Meta leads = Meta&apos;s count · CRM leads = leads in the CRM tagged with this ad
        </p>
      </div>

      <section className="panel overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="border-b border-border bg-navy/[0.02]">
            <tr>
              <th className="eyebrow px-3 py-2">Campaign</th>
              {showSet && <th className="eyebrow px-3 py-2">Ad set</th>}
              {showAd && <th className="eyebrow px-3 py-2">Ad</th>}
              <th className="eyebrow px-3 py-2 text-right">Spend</th>
              <th className="eyebrow px-3 py-2 text-right">Impressions</th>
              <th className="eyebrow px-3 py-2 text-right">Link clicks</th>
              <th className="eyebrow px-3 py-2 text-right">CTR</th>
              <th className="eyebrow px-3 py-2 text-right">CPC</th>
              <th className="eyebrow px-3 py-2 text-right">Hook rate</th>
              <th className="eyebrow px-3 py-2 text-right">Hold rate</th>
              <th className="eyebrow px-3 py-2 text-right">Meta leads</th>
              <th className="eyebrow px-3 py-2 text-right">CRM leads</th>
              <th className="eyebrow px-3 py-2 text-right">Cost / CRM lead</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border last:border-0">
                <td className="max-w-[200px] truncate px-3 py-2" title={r.campaignName}>
                  {r.campaignName}
                </td>
                {showSet && (
                  <td className="max-w-[180px] truncate px-3 py-2" title={r.adSetName ?? ""}>
                    {r.adSetName ?? "—"}
                  </td>
                )}
                {showAd && (
                  <td className="max-w-[220px] truncate px-3 py-2 font-medium" title={r.adName ?? ""}>
                    {r.adName ?? "—"}
                  </td>
                )}
                <td className="px-3 py-2 text-right">{formatInr(r.spend)}</td>
                <td className="px-3 py-2 text-right">{num(r.impressions)}</td>
                <td className="px-3 py-2 text-right">{num(r.linkClicks)}</td>
                <td className="px-3 py-2 text-right">{formatPct(r.ctr)}</td>
                <td className="px-3 py-2 text-right">{formatInr(r.cpc)}</td>
                <td className="px-3 py-2 text-right">{formatPct(r.hookRate)}</td>
                <td className="px-3 py-2 text-right">{formatPct(r.holdRate)}</td>
                <td className="px-3 py-2 text-right">{num(r.metaLeads)}</td>
                <td className="px-3 py-2 text-right">{num(r.crmLeads)}</td>
                <td className="px-3 py-2 text-right">{formatInr(r.costPerLead)}</td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="border-t-2 border-border bg-navy/[0.02] font-semibold">
                <td className="px-3 py-2" colSpan={1 + (showSet ? 1 : 0) + (showAd ? 1 : 0)}>
                  Total · {rows.length} {GROUPS.find((g) => g.id === groupBy)?.label.toLowerCase()}
                </td>
                <td className="px-3 py-2 text-right">{formatInr(totals.spend)}</td>
                <td className="px-3 py-2 text-right">{num(totals.impressions)}</td>
                <td className="px-3 py-2 text-right">{num(totals.linkClicks)}</td>
                <td className="px-3 py-2 text-right">{formatPct(totals.ctr)}</td>
                <td className="px-3 py-2 text-right">{formatInr(totals.cpc)}</td>
                <td className="px-3 py-2 text-right">{formatPct(totals.hookRate)}</td>
                <td className="px-3 py-2 text-right">{formatPct(totals.holdRate)}</td>
                <td className="px-3 py-2 text-right">{num(totals.metaLeads)}</td>
                <td className="px-3 py-2 text-right">{num(totals.crmLeads)}</td>
                <td className="px-3 py-2 text-right">{formatInr(totals.costPerLead)}</td>
              </tr>
            )}
            {rows.length === 0 && (
              <tr>
                <td colSpan={13} className="px-3 py-8 text-muted">
                  {perf.setupNeeded
                    ? "Meta ad table not set up yet — run the latest database migration, then Sync now."
                    : "No Meta data for these dates — run \"Sync now\" on the Meta connection, or upload a CSV."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {csvRows.length > 0 && (
        <section className="panel overflow-x-auto">
          <h2 className="px-3 pt-3 text-sm font-semibold">Uploaded weekly CSV rows</h2>
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
              </tr>
            </thead>
            <tbody>
              {csvRows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{r.weekLabel}</td>
                  <td className="max-w-[160px] truncate px-3 py-2">{r.campaignName}</td>
                  <td className="max-w-[160px] truncate px-3 py-2">{r.adName}</td>
                  <td className="px-3 py-2">{formatInr(r.spend)}</td>
                  <td className="px-3 py-2">{r.results}</td>
                  <td className="px-3 py-2">{formatInr(r.costPerResult)}</td>
                  <td className="px-3 py-2">{formatPct(r.ctr)}</td>
                  <td className="px-3 py-2">{formatInr(r.cpc)}</td>
                  <td className="px-3 py-2">{formatPct(r.hookRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </MarketingPageShell>
  );
}
