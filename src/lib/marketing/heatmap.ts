import type { SupabaseClient } from "@supabase/supabase-js";
import { viewportBreakpoint } from "@/lib/marketing/attribution";
import type { HeatmapPoint } from "@/types/database";

export type HeatBreakpoint = "mobile" | "tablet" | "desktop";

/** Prefer production site URLs over preview/deploy hosts. */
export function rankHeatmapPageUrl(url: string): number {
  const u = url.toLowerCase();
  if (u.includes("hiveschool.co")) return 0;
  if (u.includes("localhost")) return 2;
  if (u.includes("vercel.app")) return 3;
  return 1;
}

export function sortHeatmapPages(pages: string[]): string[] {
  return Array.from(new Set(pages)).sort((a, b) => {
    const ra = rankHeatmapPageUrl(a);
    const rb = rankHeatmapPageUrl(b);
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
}

/**
 * Live rollup from page_events clicks → heatmap buckets for one page.
 * Used when heatmap_points cron hasn't populated yet.
 */
export async function aggregateClicksForPage(
  supabase: SupabaseClient,
  pageUrl: string,
  breakpoint: HeatBreakpoint,
  opts?: { bucketSize?: number; days?: number; limit?: number }
): Promise<HeatmapPoint[]> {
  const bucketSize = opts?.bucketSize ?? 20;
  const days = opts?.days ?? 30;
  const limit = opts?.limit ?? 20000;

  const since = new Date();
  since.setDate(since.getDate() - days);

  // Match exact URL and same path with/without trailing slash / hash stripped variants
  const { data: events, error } = await supabase
    .from("page_events")
    .select("page_url, x, y, viewport_width")
    .eq("event_type", "click")
    .not("x", "is", null)
    .not("y", "is", null)
    .gte("occurred_at", since.toISOString())
    .ilike("page_url", `${pageUrl.split("#")[0].split("?")[0]}%`)
    .limit(limit);

  if (error || !events?.length) {
    // Fallback exact match
    const { data: exact } = await supabase
      .from("page_events")
      .select("page_url, x, y, viewport_width")
      .eq("event_type", "click")
      .eq("page_url", pageUrl)
      .not("x", "is", null)
      .not("y", "is", null)
      .gte("occurred_at", since.toISOString())
      .limit(limit);
    return bucketize(exact ?? [], breakpoint, bucketSize, pageUrl);
  }

  return bucketize(events, breakpoint, bucketSize, pageUrl);
}

function bucketize(
  events: {
    page_url: string;
    x: number | null;
    y: number | null;
    viewport_width: number | null;
  }[],
  breakpoint: HeatBreakpoint,
  bucketSize: number,
  pageUrl: string
): HeatmapPoint[] {
  const map = new Map<string, HeatmapPoint>();
  const now = new Date().toISOString();

  for (const ev of events) {
    if (ev.x == null || ev.y == null) continue;
    const bp = viewportBreakpoint(ev.viewport_width);
    if (bp !== breakpoint) continue;

    const xBucket = Math.floor(ev.x / bucketSize) * bucketSize;
    const yBucket = Math.floor(ev.y / bucketSize) * bucketSize;
    const key = `${xBucket}|${yBucket}`;
    const existing = map.get(key);
    if (existing) {
      existing.click_count += 1;
      existing.last_updated_at = now;
    } else {
      map.set(key, {
        page_url: pageUrl,
        x_bucket: xBucket,
        y_bucket: yBucket,
        viewport_breakpoint: breakpoint,
        click_count: 1,
        last_updated_at: now,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.click_count - a.click_count);
}

/** Which breakpoints have click coords for this page (live). */
export async function breakpointsWithClicks(
  supabase: SupabaseClient,
  pageUrl: string
): Promise<HeatBreakpoint[]> {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const base = pageUrl.split("#")[0].split("?")[0];

  const { data } = await supabase
    .from("page_events")
    .select("viewport_width")
    .eq("event_type", "click")
    .not("x", "is", null)
    .gte("occurred_at", since.toISOString())
    .ilike("page_url", `${base}%`)
    .limit(2000);

  const set = new Set<HeatBreakpoint>();
  for (const row of data ?? []) {
    set.add(viewportBreakpoint(row.viewport_width));
  }
  return Array.from(set);
}
