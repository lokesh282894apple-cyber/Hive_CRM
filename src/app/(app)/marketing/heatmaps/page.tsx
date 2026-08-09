import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui/Primitives";
import { HeatmapsClient } from "@/components/marketing/HeatmapsClient";
import { fetchTopPages } from "@/lib/marketing/queries";
import {
  aggregateClicksForPage,
  breakpointsWithClicks,
  sortHeatmapPages,
  type HeatBreakpoint,
} from "@/lib/marketing/heatmap";
import Link from "next/link";

export default async function MarketingHeatmapsPage({
  searchParams,
}: {
  searchParams: { page?: string; breakpoint?: string };
}) {
  await requireUser(["admin", "marketing"]);
  const supabase = createClient();

  const [{ data: heatPages }, topPages] = await Promise.all([
    supabase.from("heatmap_points").select("page_url").order("page_url"),
    fetchTopPages(supabase, "30", 40),
  ]);

  const fromHeat = Array.from(new Set((heatPages ?? []).map((p) => p.page_url)));
  const fromEvents = topPages.map((p) => p.page_url);
  const uniquePages = sortHeatmapPages([...fromHeat, ...fromEvents]);

  const selectedPage = searchParams.page || uniquePages[0] || "";
  let breakpoint = (searchParams.breakpoint as HeatBreakpoint) || "desktop";

  let points =
    selectedPage
      ? (
          await supabase
            .from("heatmap_points")
            .select("*")
            .eq("page_url", selectedPage)
            .eq("viewport_breakpoint", breakpoint)
            .order("click_count", { ascending: false })
            .limit(2000)
        ).data ?? []
      : [];

  let source: "cron" | "live" = "cron";

  // Live fallback — cron table is often empty until nightly job runs
  if (selectedPage && points.length === 0) {
    const available = await breakpointsWithClicks(supabase, selectedPage);
    if (available.length && !available.includes(breakpoint)) {
      breakpoint = available.includes("mobile")
        ? "mobile"
        : available.includes("tablet")
          ? "tablet"
          : available[0];
    }
    points = await aggregateClicksForPage(supabase, selectedPage, breakpoint);
    source = "live";
  }

  const hasHeatPoints = points.length > 0;

  return (
    <div>
      <PageHeader
        eyebrow="Marketing · Behaviour"
        title="Click"
        accent="Heatmaps"
        description="Click density from tracked page events. Prefers hiveschool.co pages; builds live if the nightly rollup hasn’t run yet."
      />

      {uniquePages.length === 0 ? (
        <EmptyState
          title="No page data yet"
          description="Once the website tracker sends clicks with x/y coordinates, pages appear here."
        />
      ) : (
        <>
          {!hasHeatPoints && selectedPage ? (
            <div className="panel mb-4 px-5 py-3 text-sm text-muted">
              No click coordinates for this page + breakpoint yet. Try{" "}
              <strong className="text-navy">mobile</strong> (most phone traffic) or another top
              page. Clicks need x/y from the website tracker.
            </div>
          ) : source === "live" ? (
            <div className="panel mb-4 px-5 py-3 text-sm text-muted">
              Showing <strong className="text-navy">live</strong> rollup from click events (cron
              table empty or stale for this view).
            </div>
          ) : null}

          {topPages.length > 0 ? (
            <div className="panel mb-4 p-4">
              <p className="eyebrow mb-2">Top pages (30d)</p>
              <div className="flex flex-wrap gap-2">
                {sortHeatmapPages(topPages.map((p) => p.page_url))
                  .slice(0, 12)
                  .map((pageUrl) => {
                    const p = topPages.find((t) => t.page_url === pageUrl);
                    return (
                      <Link
                        key={pageUrl}
                        href={`/marketing/heatmaps?page=${encodeURIComponent(pageUrl)}&breakpoint=${breakpoint}`}
                        className={
                          pageUrl === selectedPage
                            ? "btn-primary text-xs"
                            : "rounded-xl border border-border px-3 py-1.5 text-xs text-navy"
                        }
                      >
                        {pageUrl.replace(/^https?:\/\//, "").slice(0, 40)} · {p?.clicks ?? 0} clk
                      </Link>
                    );
                  })}
              </div>
            </div>
          ) : null}

          <HeatmapsClient
            pages={uniquePages}
            selectedPage={selectedPage}
            breakpoint={breakpoint}
            points={points}
          />
        </>
      )}
    </div>
  );
}
