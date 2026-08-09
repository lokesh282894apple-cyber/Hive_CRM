import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui/Primitives";
import { HeatmapsClient } from "@/components/marketing/HeatmapsClient";
import { fetchTopPages } from "@/lib/marketing/queries";
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
    fetchTopPages(supabase, "30", 30),
  ]);

  const fromHeat = Array.from(new Set((heatPages ?? []).map((p) => p.page_url)));
  const fromEvents = topPages.map((p) => p.page_url);
  const uniquePages = Array.from(new Set([...fromHeat, ...fromEvents])).sort();

  const selectedPage = searchParams.page || uniquePages[0] || "";
  const breakpoint =
    (searchParams.breakpoint as "mobile" | "tablet" | "desktop") || "desktop";

  const { data: points } = selectedPage
    ? await supabase
        .from("heatmap_points")
        .select("*")
        .eq("page_url", selectedPage)
        .eq("viewport_breakpoint", breakpoint)
        .order("click_count", { ascending: false })
        .limit(2000)
    : { data: [] };

  const hasHeatPoints = (points ?? []).length > 0;

  return (
    <div>
      <PageHeader
        eyebrow="Marketing · Behaviour"
        title="Click"
        accent="Heatmaps"
        description="Click density from aggregated page_events. Top pages come from live tracking; points appear after the daily heatmap cron."
      />

      {uniquePages.length === 0 ? (
        <EmptyState
          title="No page data yet"
          description="Once the website tracker sends clicks, pages appear here. Heatmap buckets fill after /api/cron/heatmap-aggregate runs."
        />
      ) : (
        <>
          {!hasHeatPoints && selectedPage ? (
            <div className="panel mb-4 px-5 py-3 text-sm text-muted">
              No aggregated heatmap points for this page yet. Cron{" "}
              <code className="text-xs">/api/cron/heatmap-aggregate</code> rolls up clicks
              nightly. You can still pick top tracked pages below.
            </div>
          ) : null}

          {topPages.length > 0 ? (
            <div className="panel mb-4 p-4">
              <p className="eyebrow mb-2">Top pages (30d)</p>
              <div className="flex flex-wrap gap-2">
                {topPages.slice(0, 10).map((p) => (
                  <Link
                    key={p.page_url}
                    href={`/marketing/heatmaps?page=${encodeURIComponent(p.page_url)}&breakpoint=${breakpoint}`}
                    className={
                      p.page_url === selectedPage
                        ? "btn-primary text-xs"
                        : "rounded-xl border border-border px-3 py-1.5 text-xs text-navy"
                    }
                  >
                    {p.page_url.replace(/^https?:\/\//, "").slice(0, 40)} · {p.clicks} clk
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          <HeatmapsClient
            pages={uniquePages}
            selectedPage={selectedPage}
            breakpoint={breakpoint}
            points={points ?? []}
          />
        </>
      )}
    </div>
  );
}
