import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Admin-only, read-only: loads the CRM's own pages the way a click does
 * (RSC request with the caller's session) and reports server time + size.
 * Each page twice: first = may be a cache miss, second = warm.
 *   /api/admin/page-timings
 */
export async function GET(request: NextRequest) {
  await requireUser(["admin"]);
  const origin = request.nextUrl.origin;
  const cookie = request.headers.get("cookie") ?? "";

  const { data: lead } = await createAdminClient()
    .from("leads")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const pages = [
    "/admin/leads",
    lead ? `/leads/${lead.id}` : null,
    "/admin/analytics",
    "/admin/counselor",
    "/admin/monthly",
    "/marketing/funnel",
    "/marketing/ads",
    "/marketing/channels",
    "/marketing/pnl/monthly",
    "/marketing/calls",
    "/program/fees",
  ].filter((p): p is string => !!p);

  const hit = async (path: string) => {
    const t = Date.now();
    try {
      const res = await fetch(`${origin}${path}`, {
        // Same request a click makes (RSC payload); no router-state header,
        // so the full page tree is rendered — an upper bound on a click
        headers: { cookie, RSC: "1" },
        cache: "no-store",
        redirect: "manual",
      });
      const body = await res.arrayBuffer();
      const out: Record<string, unknown> = { status: res.status, ms: Date.now() - t, kb: Math.round(body.byteLength / 1024) };
      if (res.status >= 400) out.sample = new TextDecoder().decode(body.slice(0, 300));
      return out;
    } catch (e) {
      return { ms: Date.now() - t, error: e instanceof Error ? e.message : String(e) };
    }
  };

  const results: Record<string, unknown> = {};
  for (const p of pages) {
    const first = await hit(p);
    const second = await hit(p);
    results[p] = { first, second };
  }
  return NextResponse.json({
    note: "ms = server time for one click. 'first' may include building the page's cached data; 'second' is a repeat visit.",
    env: {
      SUPABASE_MAX_ROWS: process.env.SUPABASE_MAX_ROWS ?? "(not set)",
      ADMISSIONS_RPC: process.env.ADMISSIONS_RPC ?? "(not set)",
    },
    pages: results,
  });
}
