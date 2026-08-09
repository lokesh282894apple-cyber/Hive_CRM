import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseUaHints } from "@/lib/marketing/attribution";
import { isUuid } from "@/lib/marketing/track-auth";

const SESSION_COOKIE = "hs_session_id";
const ONE_YEAR = 60 * 60 * 24 * 365;
const FALLBACK = "https://hiveschool.co";

function newSessionId() {
  return crypto.randomUUID();
}

/**
 * Fast tracked-slug redirect. Sets session cookie + attribution, then 302s.
 * No auth — influencer links land here from the browser.
 * Attribution logging never blocks the redirect to the creative destination.
 */
export async function GET(
  request: NextRequest,
  context: { params: { slug: string } | Promise<{ slug: string }> }
) {
  const rawParams = await Promise.resolve(context.params);
  const slug = String(rawParams?.slug || "")
    .trim()
    .toLowerCase()
    .slice(0, 80);

  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.redirect(FALLBACK, 302);
  }

  let destination = FALLBACK;
  let sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId || !isUuid(sessionId)) {
    sessionId = newSessionId();
  }

  try {
    const admin = createAdminClient();
    const { data: creative, error: creativeErr } = await admin
      .from("ad_creatives")
      .select("id, campaign_id, destination_url")
      .eq("tracked_slug", slug)
      .maybeSingle();

    if (creativeErr) {
      console.error("[go] creative lookup", slug, creativeErr.message);
    }

    if (creative?.destination_url) {
      destination = creative.destination_url;

      try {
        const now = new Date().toISOString();
        const ua = parseUaHints(request.headers.get("user-agent"));

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
            entry_page_url: destination,
            matched_campaign_id: creative.campaign_id,
            matched_ad_creative_id: creative.id,
          });
        }

        await admin.from("page_events").insert({
          session_id: sessionId,
          event_type: "click",
          page_url: `/go/${slug}`,
          page_title: `Tracked redirect ${slug}`,
          element_selector: null,
          occurred_at: now,
        });
      } catch (logErr) {
        console.error("[go] attribution log failed", slug, logErr);
      }
    }
  } catch (e) {
    console.error("[go] failed", slug, e);
  }

  const response = NextResponse.redirect(destination, 302);
  response.cookies.set(SESSION_COOKIE, sessionId, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
    secure: true,
    httpOnly: false, // website script must read it
  });
  return response;
}
