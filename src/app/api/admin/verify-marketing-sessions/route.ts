import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sessionsBySource, sessionsPerDay } from "@/lib/marketing/dashboard-queries";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Admin-only, read-only: session counts from the new RPCs must equal the old
 * row-by-row counts (funnel per-day, channel funnel per source group).
 *   /api/admin/verify-marketing-sessions
 */
export async function GET() {
  await requireUser(["admin"]);
  const db = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const daysAgo = (n: number) =>
    new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

  const ranges: [string, string][] = [
    [daysAgo(7), today],
    [daysAgo(30), today],
    [daysAgo(90), today],
    [daysAgo(60), daysAgo(45)], // a custom window
  ];

  // Confirm the RPCs exist — otherwise "auto" silently uses the row path and
  // the comparison would prove nothing.
  const probeWindow = { p_from: new Date().toISOString(), p_to: new Date().toISOString() };
  const [p1, p2] = await Promise.all([
    db.rpc("rpc_sessions_per_day", probeWindow),
    db.rpc("rpc_sessions_by_source", probeWindow),
  ]);
  if (p1.error || p2.error) {
    return NextResponse.json({
      ok: false,
      verdict: "Run supabase/migrations/20260929130000_session_count_rpcs.sql first",
      errors: [p1.error?.message, p2.error?.message].filter(Boolean),
    });
  }

  const results = [];
  for (const [fromDate, toDate] of ranges) {
    const fromIso = `${fromDate}T00:00:00.000Z`;
    const toIso = `${toDate}T23:59:59.999Z`;

    const t0 = Date.now();
    const [dayRows, srcRows] = await Promise.all([
      sessionsPerDay(db, fromIso, toIso, "rows"),
      sessionsBySource(db, fromIso, toIso, "rows"),
    ]);
    const t1 = Date.now();
    let rpcError: string | null = null;
    let dayRpc: typeof dayRows = [];
    let srcRpc: typeof srcRows = [];
    try {
      [dayRpc, srcRpc] = await Promise.all([
        sessionsPerDay(db, fromIso, toIso),
        sessionsBySource(db, fromIso, toIso),
      ]);
    } catch (e) {
      rpcError = e instanceof Error ? e.message : String(e);
    }
    const t2 = Date.now();

    const norm = (m: Map<string, number>) =>
      JSON.stringify(Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b)));
    const dayMap = (r: typeof dayRows) => new Map(r.map((x) => [x.day, x.sessions]));
    const srcMap = (r: typeof srcRows) =>
      new Map(
        r.map((x) => [JSON.stringify([x.utm_source, x.utm_medium, x.matched_campaign_id]), x.sessions])
      );

    const dayOk = !rpcError && norm(dayMap(dayRows)) === norm(dayMap(dayRpc));
    const srcOk = !rpcError && norm(srcMap(srcRows)) === norm(srcMap(srcRpc));
    results.push({
      range: `${fromDate}..${toDate}`,
      totalSessions: dayRows.reduce((s, r) => s + r.sessions, 0),
      rowsMs: t1 - t0,
      rpcMs: t2 - t1,
      rpcError,
      perDayMatches: dayOk,
      perSourceMatches: srcOk,
    });
  }

  const ok = results.every((r) => r.perDayMatches && r.perSourceMatches);
  return NextResponse.json({
    ok,
    verdict: ok ? "Session count RPCs match the row counts" : "Mismatch — tell Claude",
    results,
  });
}
