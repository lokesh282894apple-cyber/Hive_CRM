import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui/Primitives";
import { HeatmapsClient } from "@/components/marketing/HeatmapsClient";

export default async function MarketingHeatmapsPage({
  searchParams,
}: {
  searchParams: { page?: string; breakpoint?: string };
}) {
  await requireUser(["admin", "marketing"]);
  const supabase = createClient();

  const { data: pages } = await supabase
    .from("heatmap_points")
    .select("page_url")
    .order("page_url");

  const uniquePages = Array.from(new Set((pages ?? []).map((p) => p.page_url))).sort();
  const selectedPage = searchParams.page || uniquePages[0] || "";
  const breakpoint = (searchParams.breakpoint as "mobile" | "tablet" | "desktop") || "desktop";

  const { data: points } = selectedPage
    ? await supabase
        .from("heatmap_points")
        .select("*")
        .eq("page_url", selectedPage)
        .eq("viewport_breakpoint", breakpoint)
        .order("click_count", { ascending: false })
        .limit(2000)
    : { data: [] };

  return (
    <div>
      <PageHeader
        eyebrow="Marketing · Behaviour"
        title="Click"
        accent="Heatmaps"
        description="Aggregated click density from page_events. Run the daily heatmap cron to refresh."
      />
      {uniquePages.length === 0 ? (
        <EmptyState
          title="No heatmap data yet"
          description="Clicks collected by the website tracking script are rolled up nightly into heatmap_points."
        />
      ) : (
        <HeatmapsClient
          pages={uniquePages}
          selectedPage={selectedPage}
          breakpoint={breakpoint}
          points={points ?? []}
        />
      )}
    </div>
  );
}
