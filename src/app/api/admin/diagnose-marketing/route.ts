import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateMarketingCaches } from "@/lib/marketing/query-cache";
import {
  fetchAdInsights,
  fetchAttributionReport,
  fetchCampaignRoi,
  fetchChannelFunnel,
  fetchDailyCallTracker,
  fetchLeadFunnel,
  fetchLeadWebsiteMetrics,
  fetchMonthPnl,
  fetchMonthlyMarketingData,
  fetchQualificationLeads,
  parseMarketingFilters,
} from "@/lib/marketing/dashboard-queries";
import {
  fetchCampaignMetrics,
  fetchConversionsList,
  fetchMarketingOverview,
  fetchSessionList,
  fetchTopPages,
} from "@/lib/marketing/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Per-loader cap so one slow loader can't hide the rest. */
const LOADER_CAP_MS = 9_000;
const TOTAL_BUDGET_MS = 50_000;

type Outcome = { name: string; ms: number; status: "ok" | "error" | "timeout" | "skipped"; rows?: number; error?: string };

async function timed(name: string, run: () => Promise<unknown>): Promise<Outcome> {
  const t0 = Date.now();
  try {
    const result = await Promise.race([
      run().then((v) => ({ v })),
      new Promise<"timeout">((r) => setTimeout(() => r("timeout"), LOADER_CAP_MS)),
    ]);
    if (result === "timeout") return { name, ms: Date.now() - t0, status: "timeout" };
    const v = result.v;
    const rows = Array.isArray(v)
      ? v.length
      : typeof v === "number"
        ? v
        : undefined;
    return { name, ms: Date.now() - t0, status: "ok", rows };
  } catch (e) {
    return { name, ms: Date.now() - t0, status: "error", error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Admin-only, read-only timing of every marketing loader + the DB functions
 * they depend on. Busts the marketing caches first so timings are first-load.
 *   /api/admin/diagnose-marketing
 *   /api/admin/diagnose-marketing?only=fetchTopPages,marketing_top_pages
 */
export async function GET(request: NextRequest) {
  await requireUser(["admin"]);
  const only = request.nextUrl.searchParams.get("only")?.split(",").filter(Boolean);
  invalidateMarketingCaches();

  const db = createAdminClient();
  const filters = parseMarketingFilters({});
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const today = new Date().toISOString().slice(0, 10);
  const monthKey = today.slice(0, 7);

  const rpc = (fn: string, args: Record<string, unknown>) => async () => {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data;
  };
  const size = (table: string) => async () => {
    const { count, error } = await db.from(table).select("*", { count: "estimated", head: true });
    if (error) throw new Error(error.message);
    return count ?? 0;
  };

  const checks: [string, () => Promise<unknown>][] = [
    // table sizes (estimated, cheap)
    ["size:page_events", size("page_events")],
    ["size:visitor_sessions", size("visitor_sessions")],
    ["size:lead_attribution", size("lead_attribution")],
    ["size:leads", size("leads")],
    // DB functions the loaders use first (fallbacks scan raw rows if these fail)
    ["marketing_overview", rpc("marketing_overview", { p_since: since30, p_range_days: 30 })],
    ["marketing_top_pages", rpc("marketing_top_pages", { p_since: since30, p_limit: 40 })],
    ["rpc_funnel_aggregate_daily", rpc("rpc_funnel_aggregate_daily", { p_from: filters.fromDate, p_to: filters.toDate })],
    // loaders, as the pages call them
    ["fetchMarketingOverview (dashboard, performance)", () => fetchMarketingOverview(db, "30")],
    ["fetchTopPages (dashboard, pages, heatmaps)", () => fetchTopPages(db, "30", 40)],
    ["fetchCampaignMetrics (campaigns)", () => fetchCampaignMetrics(db, "30")],
    ["fetchConversionsList (conversions)", () => fetchConversionsList(db, "30", 100)],
    ["fetchSessionList (sessions)", () => fetchSessionList(db, { range: "30" } as Parameters<typeof fetchSessionList>[1])],
    ["fetchLeadFunnel (funnel)", () => fetchLeadFunnel(filters)],
    ["fetchChannelFunnel (channels, pnl)", () => fetchChannelFunnel(filters)],
    ["fetchMonthlyMarketingData (monthly)", () => fetchMonthlyMarketingData(18)],
    ["fetchMonthPnl (pnl)", () => fetchMonthPnl(monthKey)],
    ["fetchAttributionReport (attribution)", () => fetchAttributionReport(filters, "first")],
    ["fetchCampaignRoi (roi)", () => fetchCampaignRoi(filters)],
    ["fetchAdInsights (ads)", () => fetchAdInsights(filters)],
    ["fetchQualificationLeads (qualification)", () => fetchQualificationLeads(filters)],
    ["fetchLeadWebsiteMetrics (website-leads)", () => fetchLeadWebsiteMetrics(filters)],
    ["fetchDailyCallTracker (calls)", () => fetchDailyCallTracker(filters)],
  ];

  const started = Date.now();
  const results: Outcome[] = [];
  for (const [name, run] of checks) {
    if (only && !only.some((o) => name.startsWith(o))) continue;
    if (Date.now() - started > TOTAL_BUDGET_MS) {
      results.push({ name, ms: 0, status: "skipped", error: "time budget used — rerun with ?only=" });
      continue;
    }
    results.push(await timed(name, run));
  }

  return NextResponse.json({
    slow: results.filter((r) => r.status !== "ok" || r.ms > 3000).map((r) => r.name),
    results,
  });
}
