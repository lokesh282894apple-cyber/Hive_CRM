import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllPages } from "@/lib/supabase/paginate";
import { BOARD_FETCH_MAX } from "@/lib/constants";
import { bucketFunnel, loadFunnelLeads, MILESTONES } from "@/lib/analytics/funnel-engine";
import { fetchLeadFunnelUncached, sessionsPaidSplit, sessionsPerDay } from "@/lib/marketing/dashboard-queries";
import { fetchMarketingPnl } from "@/lib/marketing/pnl-monthly";
import { fetchRejectionFunnel } from "@/lib/analytics/rejection-funnel";
import { fetchCounselorDashboard } from "@/lib/analytics/counselor-performance";
import { addDays, istDateKey, istEndIso, istMonthKey, istStartIso } from "@/lib/tz";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Admin-only, read-only sample numbers for the Phase 3 metric changes.
 *   /api/admin/verify-metrics
 * Each block says what it checks and whether the invariant holds.
 */
export async function GET() {
  await requireUser(["admin"]);
  const db = createAdminClient();
  const today = istDateKey();
  const from30 = addDays(today, -29);
  const fromIso = istStartIso(from30);
  const toIso = istEndIso(today);
  const out: Record<string, unknown> = { window: `${from30} → ${today} (IST)` };

  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      out[name] = await fn();
    } catch (e) {
      out[name] = { error: e instanceof Error ? e.message : String(e) };
    }
  };

  // 1. Board: open R3 leads vs the newest-250 window the board used to show
  await step("board_r3", async () => {
    const { data: r3 } = await db
      .from("leads")
      .select("id, name, created_at, stage")
      .in("stage", ["r3_booked", "r3_tbb", "r3_reschedule", "r3_no_show"]);
    const { data: newest } = await db
      .from("leads")
      .select("id")
      .not("stage", "in", "(closed_paid,closed_deferred,closed_refund,closed_lost)")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .limit(BOARD_FETCH_MAX);
    const window = new Set((newest ?? []).map((r) => r.id));
    const rows = (r3 ?? []).map((l) => ({
      name: l.name,
      stage: l.stage,
      created: istDateKey(l.created_at),
      wasVisibleBefore: window.has(l.id),
    }));
    return {
      check: "R3 leads outside the newest-250 window were counted but not shown; the board now loads them per column",
      r3Leads: rows,
      hiddenBeforeFix: rows.filter((r) => !r.wasVisibleBefore).length,
    };
  });

  // 2. Funnel engine vs the old per-day R1 counting
  await step("funnel_engine", async () => {
    const leads = await loadFunnelLeads(db, fromIso, toIso);
    const inRange = (iso: string) => {
      const d = istDateKey(iso);
      return d >= from30 && d <= today ? d : null;
    };
    const sum = (basis: "event" | "cohort") => {
      const t: Record<string, number> = { leads: 0 };
      for (const m of MILESTONES) t[m] = 0;
      for (const c of Array.from(bucketFunnel(leads, basis, inRange).values())) {
        t.leads += c.leads.total;
        for (const m of MILESTONES) t[m] += c[m].total;
      }
      return t;
    };
    const old = await fetchAllPages<{ lead_id: string; to_stage: string; changed_at: string }>(
      (f, t) =>
        db
          .from("stage_history")
          .select("lead_id, to_stage, changed_at")
          .gte("changed_at", fromIso)
          .lte("changed_at", toIso)
          .order("id", { ascending: true })
          .range(f, t),
      "verify.history"
    );
    const OLD_DONE = new Set(["r1_confirmed", "r2_booked", "r2_tbb", "r3_booked", "yet_to_offer", "offered", "closed_paid"]);
    const perDay = new Set<string>();
    const uniq = new Set<string>();
    for (const h of old) {
      if (!OLD_DONE.has(h.to_stage)) continue;
      perDay.add(`${h.lead_id}:${istDateKey(h.changed_at)}`);
      uniq.add(h.lead_id);
    }
    return {
      check: "event = counted on the day it happened, cohort = on the lead's created day; each lead once per milestone",
      event: sum("event"),
      cohort: sum("cohort"),
      oldR1DoneCount: perDay.size,
      oldR1DoneUniqueLeads: uniq.size,
      note: "oldR1DoneCount > unique leads shows the old double counting",
    };
  });

  // 3. Sessions split adds up to sessions
  await step("sessions_split", async () => {
    const [days, split] = await Promise.all([sessionsPerDay(db, fromIso, toIso), sessionsPaidSplit(db, fromIso, toIso)]);
    if (!split) return { ok: false, verdict: "rpc_sessions_paid_split_ist missing — run migration 20261002110000" };
    const total = days.reduce((n, d) => n + d.sessions, 0);
    const paid = split.reduce((n, d) => n + d.paid, 0);
    const organic = split.reduce((n, d) => n + d.organic, 0);
    return { ok: paid + organic === total, sessions: total, paid, organic };
  });

  // 4. Leads dashboard totals (same engine)
  await step("leads_dashboard", async () => {
    const rows = await fetchLeadFunnelUncached({ fromDate: from30, toDate: today, basis: "event" });
    const t = rows.reduce(
      (a, r) => ({
        leads: a.leads + r.leads,
        r1Booked: a.r1Booked + r.r1Booked,
        r1Done: a.r1Done + r.r1Completed,
        r2: a.r2 + r.funnel.r2Booked.total,
        r3: a.r3 + r.funnel.r3Booked.total,
        offer: a.offer + r.funnel.offer.total,
        convert: a.convert + r.funnel.convert.total,
        spend: a.spend + r.totalSpend,
      }),
      { leads: 0, r1Booked: 0, r1Done: 0, r2: 0, r3: 0, offer: 0, convert: 0, spend: 0 }
    );
    return {
      ...t,
      costPerR2: t.r2 ? Math.round(t.spend / t.r2) : null,
      costPerR3: t.r3 ? Math.round(t.spend / t.r3) : null,
      costPerOffer: t.offer ? Math.round(t.spend / t.offer) : null,
      costPerConvert: t.convert ? Math.round(t.spend / t.convert) : null,
    };
  });

  // 5. Meta: ad-level daily rows vs campaign spend
  await step("meta", async () => {
    const [{ data: daily, error }, { data: camp }] = await Promise.all([
      db.from("meta_ad_insights_daily").select("ad_id, spend, meta_leads, video_plays_3s, impressions").gte("date", from30),
      db.from("ad_spend_daily").select("spend").gte("date", from30),
    ]);
    if (error) return { ok: false, verdict: `meta_ad_insights_daily: ${error.message} — run migration 20261002100000 then Sync now` };
    const adSpend = (daily ?? []).reduce((n, r) => n + Number(r.spend), 0);
    const campSpend = (camp ?? []).reduce((n, r) => n + Number(r.spend), 0);
    const imps = (daily ?? []).reduce((n, r) => n + Number(r.impressions), 0);
    const v3 = (daily ?? []).reduce((n, r) => n + Number(r.video_plays_3s), 0);
    return {
      ads: new Set((daily ?? []).map((r) => r.ad_id)).size,
      rows: (daily ?? []).length,
      adLevelSpend: Math.round(adSpend),
      campaignDailySpend: Math.round(campSpend),
      metaLeads: (daily ?? []).reduce((n, r) => n + Number(r.meta_leads), 0),
      hookRatePct: imps ? Number(((v3 / imps) * 100).toFixed(2)) : null,
      note: "after a sync, adLevelSpend ≈ campaignDailySpend (manual CSV spend excluded)",
    };
  });

  // 6. P&L last 3 months
  await step("pnl", async () => {
    const to = istMonthKey();
    const [y, m] = to.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 3, 1));
    const from = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const months = await fetchMarketingPnl(from, to);
    return months.map((p) => ({
      month: p.month,
      source: p.source,
      leads: p.values.leads,
      totalSpend: p.values.totalSpend,
      converts: p.counts.convert,
      cpa: p.values.cpa,
      revenueBooked: p.values.revenueBooked,
      gst: p.values.gstBooked,
      revenueRealised: p.values.revenueRealised,
      arpu: p.values.arpu,
    }));
  });

  // 7. Rejections (by rejection date)
  await step("rejections", async () => {
    const r = await fetchRejectionFunnel(db, { sinceIso: fromIso, untilExclusiveIso: istStartIso(addDays(today, 1)) });
    return {
      hiveTotal: r.hiveTotal,
      studentTotal: r.studentTotal,
      topHive: r.hiveReasonShares.slice(0, 6).map((s) => ({ reason: s.reason, count: s.count, pct: s.pct?.toFixed(1) })),
      pctSum: r.hiveReasonShares.reduce((n, s) => n + (s.pct ?? 0), 0).toFixed(1),
    };
  });

  // 8. Counselor outcome table
  await step("counselor", async () => {
    const d = await fetchCounselorDashboard(db, { sinceIso: fromIso, untilExclusiveIso: istStartIso(addDays(today, 1)) });
    const t = d.outcomeTotals;
    const bucketSum = Object.values(t.outcome).reduce((a, b) => a + b, 0);
    return {
      ok: bucketSum === t.leadsCalled,
      check: "every lead called lands in exactly one outcome bucket",
      dials: t.dials,
      leadsCalled: t.leadsCalled,
      outcome: t.outcome,
      r1: t.r1,
      fromR1: t.fromR1,
      perCounselor: d.outcomes.map((o) => ({ name: o.name, dials: o.dials, leads: o.leadsCalled, r1Booked: o.outcome.r1Booked })),
    };
  });

  // 9. Scoring
  await step("scoring", async () => {
    const { count: withQuality, error } = await db
      .from("leads")
      .select("id", { count: "exact", head: true })
      .not("lead_quality", "is", null);
    if (error) return { ok: false, verdict: `${error.message} — run migration 20261002120000` };
    const { count: withCounselor } = await db
      .from("leads")
      .select("id", { count: "exact", head: true })
      .not("counselor_intent", "is", null);
    const { count: withPanel } = await db
      .from("leads")
      .select("id", { count: "exact", head: true })
      .not("panel_intent", "is", null);
    return { leadsWithLeadQuality: withQuality, leadsWithCounselorScore: withCounselor, leadsWithPanelScore: withPanel };
  });

  return NextResponse.json(out);
}
