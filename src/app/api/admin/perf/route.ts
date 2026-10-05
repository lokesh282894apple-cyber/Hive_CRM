import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyLeadsFilters, fetchStageTotals, parseLeadsSearchParams, selectLeadsList } from "@/lib/leads-query";
import { loadFunnelLeads } from "@/lib/analytics/funnel-engine";
import { fetchLeadFunnelUncached } from "@/lib/marketing/dashboard-queries";
import { fetchCounselorDashboardUncached } from "@/lib/analytics/counselor-performance";
import { fetchAdmissionsFunnelUncached } from "@/lib/analytics/admissions-funnel";
import { loadLeadCardMetrics } from "@/lib/leads/card-metrics";
import { addDays, istDateKey, istEndIso, istStartIso } from "@/lib/tz";
import type { LeadWithRelations } from "@/types/database";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Admin-only, read-only: how long each heavy data load takes on live data,
 * uncached (what a first visit / cache miss costs).   /api/admin/perf
 */
export async function GET() {
  await requireUser(["admin"]);
  const db = createAdminClient();
  const today = istDateKey();
  const from30 = addDays(today, -29);
  const out: Record<string, unknown> = {
    env: {
      SUPABASE_MAX_ROWS: process.env.SUPABASE_MAX_ROWS ?? "(not set — pages of 1000 rows)",
      ADMISSIONS_RPC: process.env.ADMISSIONS_RPC ?? "(not set — counselor home uses slow path)",
      CRON_SECRET: process.env.CRON_SECRET ? "set" : "(not set — daily jobs fail)",
      region: process.env.VERCEL_REGION ?? "?",
    },
  };

  const time = async (name: string, fn: () => Promise<unknown>) => {
    const t = Date.now();
    try {
      const r = await fn();
      out[name] = { ms: Date.now() - t, ...(r && typeof r === "object" && !Array.isArray(r) ? (r as object) : {}) };
    } catch (e) {
      out[name] = { ms: Date.now() - t, error: e instanceof Error ? e.message : String(e) };
    }
  };

  await time("db_ping", async () => {
    const pings: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t = Date.now();
      await db.from("users").select("id").limit(1);
      pings.push(Date.now() - t);
    }
    return { pingsMs: pings };
  });

  const filters = parseLeadsSearchParams({}, { ownership: "all", isAdmin: true });
  const opts = { filters, userId: "00000000-0000-0000-0000-000000000000", isAdmin: true, scopes: [] };
  let cards: LeadWithRelations[] = [];
  await time("board_cards", async () => {
    const r = await selectLeadsList(db, opts);
    cards = (r.data as unknown as LeadWithRelations[]) ?? [];
    return { rows: cards.length };
  });
  await time("board_count", async () => {
    const { count } = await applyLeadsFilters(db.from("leads").select("id", { count: "exact", head: true }), {
      ...opts,
      paginate: false,
    });
    return { count };
  });
  await time("board_stage_totals", async () => ({ stages: Object.keys(await fetchStageTotals(db, opts)).length }));
  await time("board_card_metrics", async () => ({ rows: (await loadLeadCardMetrics(db, cards)).length }));

  await time("funnel_engine_30d", async () => ({ leads: (await loadFunnelLeads(db, istStartIso(from30), istEndIso(today))).length }));
  await time("leads_funnel_30d", async () => ({ days: (await fetchLeadFunnelUncached({ fromDate: from30, toDate: today })).length }));
  await time("counselor_30d", async () => ({
    counselors: (await fetchCounselorDashboardUncached({ sinceIso: istStartIso(from30), untilExclusiveIso: istStartIso(addDays(today, 1)) })).rows.length,
  }));
  await time("admission_analytics_30d", async () => {
    await fetchAdmissionsFunnelUncached(db, { fromDate: from30, toDate: today });
    return {};
  });

  return NextResponse.json(out);
}
