import type { SupabaseClient } from "@supabase/supabase-js";

/** Known social / search referrer hosts → channel name (must match seeded channels). */
export const KNOWN_REFERRER_CHANNELS: { hostIncludes: string[]; channelName: string }[] = [
  { hostIncludes: ["facebook.com", "fb.com", "fb.me", "m.facebook.com", "l.facebook.com"], channelName: "Meta" },
  { hostIncludes: ["instagram.com", "l.instagram.com"], channelName: "Instagram Organic" },
  { hostIncludes: ["google.com", "google.co", "googleadservices.com"], channelName: "Google" },
  { hostIncludes: ["linkedin.com", "lnkd.in"], channelName: "LinkedIn" },
  { hostIncludes: ["youtube.com", "youtu.be"], channelName: "YouTube" },
  { hostIncludes: ["twitter.com", "x.com", "t.co"], channelName: "Twitter/X" },
  { hostIncludes: ["tiktok.com"], channelName: "TikTok" },
];

const UTM_SOURCE_TO_CHANNEL: { match: RegExp; channelName: string }[] = [
  { match: /^(meta|facebook|fb|fbads)$/i, channelName: "Meta" },
  { match: /^(instagram|ig)$/i, channelName: "Instagram Organic" },
  { match: /^(google|googleads|adwords|youtube)$/i, channelName: "Google" },
  { match: /^(linkedin|li)$/i, channelName: "LinkedIn" },
  { match: /^(twitter|x)$/i, channelName: "Twitter/X" },
  { match: /^tiktok$/i, channelName: "TikTok" },
  { match: /^(referral|friend|alumni)$/i, channelName: "Referral" },
];

type SourceType = "paid_ad" | "influencer" | "organic";

function hostFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function classifyReferrerChannel(referrerUrl: string | null | undefined): string | null {
  const host = hostFromUrl(referrerUrl);
  if (!host) return null;
  for (const row of KNOWN_REFERRER_CHANNELS) {
    if (row.hostIncludes.some((h) => host === h || host.endsWith(`.${h}`) || host.includes(h))) {
      return row.channelName;
    }
  }
  return null;
}

function channelFromUtmSource(utmSource: string | null | undefined): string | null {
  if (!utmSource) return null;
  const s = utmSource.trim();
  for (const row of UTM_SOURCE_TO_CHANNEL) {
    if (row.match.test(s)) return row.channelName;
  }
  return null;
}

function sourceTypeFromUtm(utmMedium: string | null | undefined, utmSource: string | null | undefined): SourceType {
  const medium = (utmMedium ?? "").toLowerCase();
  const source = (utmSource ?? "").toLowerCase();
  if (/influencer|creator|collab/.test(medium) || /influencer|creator/.test(source)) {
    return "influencer";
  }
  if (/cpc|ppc|paid|paidsocial|display|ads?/.test(medium) || /ads?$/.test(source)) {
    return "paid_ad";
  }
  return "organic";
}

async function getChannelId(admin: SupabaseClient, channelName: string): Promise<string | null> {
  const { data } = await admin.from("channels").select("id").eq("name", channelName).maybeSingle();
  if (data?.id) return data.id;

  // Fallback: Other Organic
  const { data: other } = await admin
    .from("channels")
    .select("id")
    .eq("name", "Other Organic")
    .maybeSingle();
  return other?.id ?? null;
}

/**
 * Idempotent get-or-create campaign by channel + name + source_type.
 */
export async function getOrCreateCampaign(
  admin: SupabaseClient,
  input: {
    channelName: string;
    name: string;
    source_type: SourceType;
    platform_campaign_id?: string | null;
    ad_account_id?: string | null;
  }
): Promise<string | null> {
  const channelId = await getChannelId(admin, input.channelName);
  if (!channelId) return null;

  const name = input.name.trim().slice(0, 200);
  if (!name) return null;

  const { data: existing } = await admin
    .from("campaigns")
    .select("id")
    .eq("channel_id", channelId)
    .eq("name", name)
    .eq("source_type", input.source_type)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await admin
    .from("campaigns")
    .insert({
      channel_id: channelId,
      name,
      source_type: input.source_type,
      status: "active",
      platform_campaign_id: input.platform_campaign_id || null,
      ad_account_id: input.ad_account_id || null,
    })
    .select("id")
    .single();

  if (error) {
    // Race: another request may have created it
    const { data: again } = await admin
      .from("campaigns")
      .select("id")
      .eq("channel_id", channelId)
      .eq("name", name)
      .eq("source_type", input.source_type)
      .maybeSingle();
    return again?.id ?? null;
  }

  return created?.id ?? null;
}

/**
 * Seed one default organic catch-all campaign per active channel (idempotent).
 */
export async function ensureDefaultCampaigns(admin: SupabaseClient): Promise<number> {
  const { data: channels } = await admin.from("channels").select("id, name").eq("active", true);
  let created = 0;
  for (const ch of channels ?? []) {
    const name = `Unattributed / Organic — ${ch.name}`;
    const { data: existing } = await admin
      .from("campaigns")
      .select("id")
      .eq("channel_id", ch.id)
      .eq("name", name)
      .maybeSingle();
    if (existing) continue;
    const { error } = await admin.from("campaigns").insert({
      channel_id: ch.id,
      name,
      source_type: "organic",
      status: "active",
    });
    if (!error) created += 1;
  }
  return created;
}

/**
 * Resolve campaign from UTM → click ids → referrer → Direct.
 * Auto-creates campaigns when they don't exist yet.
 */
export async function resolveCampaignFromTraffic(
  admin: SupabaseClient,
  input: {
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    referrer_url?: string | null;
    click_id?: string | null;
    fbclid?: string | null;
    gclid?: string | null;
    li_fat_id?: string | null;
    ttclid?: string | null;
  }
): Promise<string | null> {
  const sourceType = sourceTypeFromUtm(input.utm_medium, input.utm_source);

  // 1) Explicit UTM campaign name
  if (input.utm_campaign || input.utm_source) {
    const channelName =
      channelFromUtmSource(input.utm_source) ||
      classifyReferrerChannel(input.referrer_url) ||
      "Other Organic";

    const campaignName = input.utm_campaign
      ? input.utm_campaign
      : `${input.utm_source || "traffic"}${input.utm_medium ? ` / ${input.utm_medium}` : ""}`;

    const id = await getOrCreateCampaign(admin, {
      channelName,
      name: campaignName,
      source_type: sourceType,
    });
    if (id) return id;
  }

  // 2) Paid click ids without UTM
  if (input.fbclid || input.click_id?.startsWith("fb")) {
    return getOrCreateCampaign(admin, {
      channelName: "Meta",
      name: "Meta Paid (auto)",
      source_type: "paid_ad",
    });
  }
  if (input.gclid) {
    return getOrCreateCampaign(admin, {
      channelName: "Google",
      name: "Google Paid (auto)",
      source_type: "paid_ad",
    });
  }
  if (input.li_fat_id) {
    return getOrCreateCampaign(admin, {
      channelName: "LinkedIn",
      name: "LinkedIn Paid (auto)",
      source_type: "paid_ad",
    });
  }
  if (input.ttclid) {
    return getOrCreateCampaign(admin, {
      channelName: "TikTok",
      name: "TikTok Paid (auto)",
      source_type: "paid_ad",
    });
  }

  // 3) Referrer → organic unattributed
  const referrerChannel = classifyReferrerChannel(input.referrer_url);
  if (referrerChannel) {
    return getOrCreateCampaign(admin, {
      channelName: referrerChannel,
      name: `Unattributed / Organic — ${referrerChannel}`,
      source_type: "organic",
    });
  }

  // 4) Direct / unknown
  if (!input.referrer_url) {
    return getOrCreateCampaign(admin, {
      channelName: "Direct",
      name: "Unattributed / Organic — Direct",
      source_type: "organic",
    });
  }

  return getOrCreateCampaign(admin, {
    channelName: "Other Organic",
    name: "Unattributed / Organic — Other Organic",
    source_type: "organic",
  });
}

/** @deprecated use resolveCampaignFromTraffic */
export async function resolveOrganicCampaignFromReferrer(
  admin: SupabaseClient,
  referrerUrl: string | null | undefined
): Promise<string | null> {
  return resolveCampaignFromTraffic(admin, { referrer_url: referrerUrl });
}

export function extractClickId(params: {
  fbclid?: string | null;
  gclid?: string | null;
  li_fat_id?: string | null;
  ttclid?: string | null;
  click_id?: string | null;
}): string | null {
  return (
    params.click_id ||
    params.fbclid ||
    params.gclid ||
    params.li_fat_id ||
    params.ttclid ||
    null
  );
}

export function parseUaHints(userAgent: string | null): {
  device_type: string;
  browser: string;
  os: string;
} {
  const ua = (userAgent ?? "").toLowerCase();
  let device_type = "desktop";
  if (/ipad|tablet/.test(ua)) device_type = "tablet";
  else if (/mobi|iphone|android/.test(ua)) device_type = "mobile";

  let browser = "other";
  if (ua.includes("edg/")) browser = "edge";
  else if (ua.includes("chrome")) browser = "chrome";
  else if (ua.includes("safari")) browser = "safari";
  else if (ua.includes("firefox")) browser = "firefox";

  let os = "other";
  if (ua.includes("windows")) os = "windows";
  else if (ua.includes("mac os") || ua.includes("macintosh")) os = "macos";
  else if (ua.includes("android")) os = "android";
  else if (ua.includes("iphone") || ua.includes("ipad")) os = "ios";
  else if (ua.includes("linux")) os = "linux";

  return { device_type, browser, os };
}

export function viewportBreakpoint(width: number | null | undefined): "mobile" | "tablet" | "desktop" {
  if (width == null || width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

export function slugifyCreativeName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || "creative"}-${suffix}`;
}
