import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard } from "@/components/ui/Primitives";
import { MarketingSubNav } from "@/components/marketing/MarketingSubNav";
import { RangeTabs } from "@/components/marketing/RangeTabs";
import { fetchTopPages, parseRange, type RangeKey } from "@/lib/marketing/queries";
import Link from "next/link";

export default async function MarketingPagesPage({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  await requireUser(["admin", "marketing"]);
  const range = parseRange(searchParams.range) as RangeKey;
  const supabase = createClient();
  const pages = await fetchTopPages(supabase, range, 80);

  const totalPv = pages.reduce((s, p) => s + p.pageviews, 0);
  const totalClicks = pages.reduce((s, p) => s + p.clicks, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Marketing · Behaviour"
        title="Top"
        accent="Pages"
        description={`Pageviews, clicks, and scroll-depth reach across the site — last ${range} days.`}
        actions={<RangeTabs basePath="/marketing/pages" range={range} />}
      />
      <MarketingSubNav section="website" />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Pages tracked" value={pages.length} />
        <StatCard label="Pageviews" value={totalPv} />
        <StatCard label="Clicks" value={totalClicks} />
      </div>

      <section className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="border-b border-border bg-navy/[0.02]">
              <tr>
                <th className="eyebrow px-4 py-3">Page</th>
                <th className="eyebrow px-4 py-3">Views</th>
                <th className="eyebrow px-4 py-3">Clicks</th>
                <th className="eyebrow px-4 py-3">Scroll 25</th>
                <th className="eyebrow px-4 py-3">50</th>
                <th className="eyebrow px-4 py-3">75</th>
                <th className="eyebrow px-4 py-3">100</th>
                <th className="eyebrow px-4 py-3">Heatmap</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.page_url} className="border-b border-border last:border-0">
                  <td className="max-w-[320px] truncate px-4 py-2.5 font-medium text-navy" title={p.page_url}>
                    {p.page_url.replace(/^https?:\/\//, "")}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{p.pageviews}</td>
                  <td className="px-4 py-2.5 text-muted">{p.clicks}</td>
                  <td className="px-4 py-2.5 text-muted">{p.scroll_25}</td>
                  <td className="px-4 py-2.5 text-muted">{p.scroll_50}</td>
                  <td className="px-4 py-2.5 text-muted">{p.scroll_75}</td>
                  <td className="px-4 py-2.5 text-muted">{p.scroll_100}</td>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/marketing/heatmaps?page=${encodeURIComponent(p.page_url)}`}
                      className="text-xs font-semibold text-periwinkle hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {pages.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted">
                    No page events in this range.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
