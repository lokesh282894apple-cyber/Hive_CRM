import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseUaHints } from "@/lib/marketing/attribution";
import { isUuid } from "@/lib/marketing/track-auth";

const SESSION_COOKIE = "hs_session_id";
const ONE_YEAR = 60 * 60 * 24 * 365;

function newSessionId() {
  return crypto.randomUUID();
}

/**
 * Fast tracked-slug redirect. Sets session cookie + attribution, then 302s.
 * No auth — influencer links land here from the browser.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const slug = String(params.slug || "")
    .trim()
    .toLowerCase()
    .slice(0, 80);

  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.redirect(new URL("https://hiveschool.co", request.url), 302);
  }

  try {
    const admin = createAdminClient();
    const { data: creative } = await admin
      .from("ad_creatives")
      .select("id, campaign_id, destination_url")
      .eq("tracked_slug", slug)
      .maybeSingle();

    if (!creative?.destination_url) {
      return NextResponse.redirect(new URL("https://hiveschool.co", request.url), 302);
    }

    let sessionId = request.cookies.get(SESSION_COOKIE)?.value;
    if (!sessionId || !isUuid(sessionId)) {
      sessionId = newSessionId();
    }

    const now = new Date().toISOString();
    const ua = parseUaHints(request.headers.get("user-agent"));
    const entry = creative.destination_url;

    const { data: existing } = await admin
      .from("visitor_sessions")
      .select("id")
      .eq("id", sessionId)
      .maybeSingle();

    if (existing) {
      await admin
        .from("visitor_sessions")
        .update({
          last_seen_at: now,
          matched_campaign_id: creative.campaign_id,
          matched_ad_creative_id: creative.id,
        })
        .eq("id", sessionId);
    } else {
      await admin.from("visitor_sessions").insert({
        id: sessionId,
        first_seen_at: now,
        last_seen_at: now,
        device_type: ua.device_type,
        browser: ua.browser,
        os: ua.os,
        entry_page_url: entry,
        matched_campaign_id: creative.campaign_id,
        matched_ad_creative_id: creative.id,
      });
    }

    // Fire-and-forget click event (don't block redirect hard)
    void admin.from("page_events").insert({
      session_id: sessionId,
      event_type: "click",
      page_url: `/go/${slug}`,
      page_title: `Tracked redirect ${slug}`,
      element_selector: null,
      occurred_at: now,
    });

    const response = NextResponse.redirect(creative.destination_url, 302);
    response.cookies.set(SESSION_COOKIE, sessionId, {
      path: "/",
      maxAge: ONE_YEAR,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: false, // website script must read it
    });
    return response;
  } catch {
    return NextResponse.redirect(new URL("https://hiveschool.co", request.url), 302);
  }
}
