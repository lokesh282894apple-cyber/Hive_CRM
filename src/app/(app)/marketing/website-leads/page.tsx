import { requireUser } from "@/lib/auth";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import {
  fetchLeadWebsiteMetrics,
  parseMarketingFilters,
} from "@/lib/marketing/dashboard-queries";
import Link from "next/link";

export default async function MarketingWebsiteLeadsPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  await requireUser(["admin", "marketing"]);
  const filters = parseMarketingFilters(searchParams);
  const rows = await fetchLeadWebsiteMetrics(filters);

  return (
    <MarketingPageShell
      title="Lead-level website time"
      description="Session join — time on site, pages, last page before convert"
      basePath="/marketing/website-leads"
      section="website"
    >
      <section className="panel overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-navy/[0.02]">
            <tr>
              <th className="eyebrow px-3 py-2">Lead</th>
              <th className="eyebrow px-3 py-2">Stage</th>
              <th className="eyebrow px-3 py-2">Time on site</th>
              <th className="eyebrow px-3 py-2">Pageviews</th>
              <th className="eyebrow px-3 py-2">Last page</th>
              <th className="eyebrow px-3 py-2">Heatmap</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.leadId} className="border-b border-border">
                <td className="px-3 py-2">
                  <Link href={`/leads/${r.leadId}`} className="font-medium hover:underline">
                    {r.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-muted">{r.stage}</td>
                <td className="px-3 py-2">{Math.round(r.timeOnSiteSec / 60)}m {r.timeOnSiteSec % 60}s</td>
                <td className="px-3 py-2">{r.pageviews}</td>
                <td className="px-3 py-2 max-w-[200px] truncate text-muted">{r.lastPage ?? "—"}</td>
                <td className="px-3 py-2">
                  {r.clarityUrl ? (
                    <a href={r.clarityUrl} target="_blank" rel="noreferrer" className="text-navy underline">
                      Clarity
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-muted">
                  No leads with website session_id in this range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </MarketingPageShell>
  );
}
