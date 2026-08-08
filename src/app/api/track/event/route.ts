import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  extractClickId,
  parseUaHints,
  resolveCampaignFromTraffic,
} from "@/lib/marketing/attribution";
import {
  clampInt,
  isUuid,
  trackCorsHeaders,
  truncate,
} from "@/lib/marketing/track-auth";

const EVENT_TYPES = new Set(["pageview", "click", "scroll_depth"]);

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: trackCorsHeaders(origin),
  });
}

/**
 * Public tracking ingest from hiveschool.co.
 * Auto-creates campaigns from UTM / click ids / referrer on first match.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const cors = trackCorsHeaders(origin);

  try {
    const body = await request.json();
    const sessionId = body.session_id;
    const eventType = String(body.event_type || "");
    const pageUrl = truncate(body.page_url, 2000);

    if (!isUuid(sessionId)) {
      return NextResponse.json(
        { error: "session_id must be a uuid" },
        { status: 400, headers: cors }
      );
    }
    if (!EVENT_TYPES.has(eventType)) {
      return NextResponse.json(
        { error: "invalid event_type" },
        { status: 400, headers: cors }
      );
    }
    if (!pageUrl) {
      return NextResponse.json(
        { error: "page_url required" },
        { status: 400, headers: cors }
      );
    }

    const admin = createAdminClient();
    const now = new Date().toISOString();
    const ua = parseUaHints(request.headers.get("user-agent"));

    const utm_source = truncate(body.utm_source, 200);
    const utm_medium = truncate(body.utm_medium, 200);
    const utm_campaign = truncate(body.utm_campaign, 200);
    const utm_content = truncate(body.utm_content, 200);
    const utm_term = truncate(body.utm_term, 200);
    const referrer_url = truncate(body.referrer_url, 2000);
    const fbclid = truncate(body.fbclid, 500);
    const gclid = truncate(body.gclid, 500);
    const li_fat_id = truncate(body.li_fat_id, 500);
    const ttclid = truncate(body.ttclid, 500);
    const click_id = extractClickId({
      click_id: truncate(body.click_id, 500),
      fbclid,
      gclid,
      li_fat_id,
      ttclid,
    });

    const { data: existing } = await admin
      .from("visitor_sessions")
      .select("id, matched_campaign_id, entry_page_url")
      .eq("id", sessionId)
      .maybeSingle();

    let matchedCampaignId = existing?.matched_campaign_id ?? null;

    if (!matchedCampaignId) {
      matchedCampaignId = await resolveCampaignFromTraffic(admin, {
        utm_source,
        utm_medium,
        utm_campaign,
        referrer_url,
        click_id,
        fbclid,
        gclid,
        li_fat_id,
        ttclid,
      });
    }

    if (!existing) {
      const { error: sessionError } = await admin.from("visitor_sessions").insert({
        id: sessionId,
        first_seen_at: now,
        last_seen_at: now,
        device_type: truncate(body.device_type, 50) ?? ua.device_type,
        browser: truncate(body.browser, 50) ?? ua.browser,
        os: truncate(body.os, 50) ?? ua.os,
        entry_page_url: pageUrl,
        referrer_url,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_content,
        utm_term,
        click_id,
        matched_campaign_id: matchedCampaignId,
      });

      if (sessionError) {
        return NextResponse.json(
          { error: sessionError.message },
          { status: 400, headers: cors }
        );
      }
    } else {
      const patch: Record<string, unknown> = { last_seen_at: now };
      if (matchedCampaignId && !existing.matched_campaign_id) {
        patch.matched_campaign_id = matchedCampaignId;
      }
      if (utm_source) patch.utm_source = utm_source;
      if (utm_medium) patch.utm_medium = utm_medium;
      if (utm_campaign) patch.utm_campaign = utm_campaign;
      if (utm_content) patch.utm_content = utm_content;
      if (utm_term) patch.utm_term = utm_term;
      if (click_id) patch.click_id = click_id;
      if (referrer_url && !existing.entry_page_url) patch.referrer_url = referrer_url;

      await admin.from("visitor_sessions").update(patch).eq("id", sessionId);
    }

    const { error: eventError } = await admin.from("page_events").insert({
      session_id: sessionId,
      event_type: eventType,
      page_url: pageUrl,
      page_title: truncate(body.page_title, 500),
      element_selector: truncate(body.element_selector, 1000),
      x: clampInt(body.x, 0, 100000),
      y: clampInt(body.y, 0, 100000),
      viewport_width: clampInt(body.viewport_width, 0, 10000),
      viewport_height: clampInt(body.viewport_height, 0, 10000),
      occurred_at: now,
    });

    if (eventError) {
      return NextResponse.json(
        { error: eventError.message },
        { status: 400, headers: cors }
      );
    }

    return NextResponse.json(
      { ok: true, matched_campaign_id: matchedCampaignId },
      { headers: cors }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500, headers: cors }
    );
  }
}
