import type { SupabaseClient } from "@supabase/supabase-js";
import { istDateKey } from "@/lib/tz";

type MetaInsight = {
  date_start: string;
  date_stop: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  reach?: string;
  actions?: { action_type: string; value: string }[];
  video_thruplay_watched_actions?: { action_type: string; value: string }[];
};

function looksLikeAdAccountId(id: string): boolean {
  // Only trust explicit act_ prefix — bare digits may be a Page ID.
  return /^act_\d{5,}$/i.test(id.trim());
}

/**
 * Resolve Meta ad account IDs from a connection.
 * - act_… → use directly
 * - else me/adaccounts (user / system user)
 * - else Page → Business → owned_ad_accounts
 */
export async function resolveMetaAdAccountIds(
  accessToken: string,
  accountId: string
): Promise<{ accounts: string[]; errors: string[] }> {
  const errors: string[] = [];
  const accounts = new Set<string>();
  const trimmed = accountId.trim();

  if (looksLikeAdAccountId(trimmed)) {
    accounts.add(trimmed.replace(/^act_/i, ""));
  }

  // 1) User / System User token
  const mine = await graphGet<{
    data?: { account_id: string }[];
    error?: { message: string };
  }>(accessToken, "me/adaccounts?fields=account_id,name&limit=50");
  if (mine.ok && mine.body.data) {
    for (const a of mine.body.data) {
      if (a.account_id) accounts.add(String(a.account_id).replace(/^act_/, ""));
    }
  }

  // 2) Page → business → owned ad accounts (works for many BM setups)
  if (!accounts.size && /^\d+$/.test(trimmed)) {
    const page = await graphGet<{
      business?: { id: string };
      error?: { message: string };
    }>(accessToken, `${trimmed}?fields=business`);
    const businessId = page.body?.business?.id;
    if (businessId) {
      const owned = await graphGet<{
        data?: { account_id: string; id?: string }[];
        error?: { message: string };
      }>(
        accessToken,
        `${businessId}/owned_ad_accounts?fields=account_id,name&limit=50`
      );
      if (owned.ok && owned.body.data) {
        for (const a of owned.body.data) {
          const id = a.account_id || a.id;
          if (id) accounts.add(String(id).replace(/^act_/, ""));
        }
      } else if (owned.body?.error) {
        errors.push(owned.body.error.message);
      }

      const client = await graphGet<{
        data?: { account_id: string; id?: string }[];
      }>(
        accessToken,
        `${businessId}/client_ad_accounts?fields=account_id,name&limit=50`
      );
      if (client.ok && client.body.data) {
        for (const a of client.body.data) {
          const id = a.account_id || a.id;
          if (id) accounts.add(String(id).replace(/^act_/, ""));
        }
      }
    }
  }

  // 3) Last resort: try bare numeric id as ad account (insights will error if it's a Page)
  if (!accounts.size && /^\d{5,}$/.test(trimmed) && !looksLikeAdAccountId(trimmed)) {
    accounts.add(trimmed);
  }

  if (!accounts.size) {
    errors.push(
      mine.body?.error?.message ||
        "No Meta ad accounts found. Save Account ID as act_… (Ads Manager) or use a System User token with ads_read."
    );
  }

  return { accounts: Array.from(accounts), errors };
}

async function graphGet<T>(
  accessToken: string,
  path: string
): Promise<{ ok: boolean; body: T }> {
  const url = path.startsWith("http")
    ? path
    : `https://graph.facebook.com/v21.0/${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = (await res.json()) as T;
  return { ok: res.ok, body };
}

/**
 * Pull daily ad-level insights from the Meta Marketing API.
 * Writes one row per ad per day to meta_ad_insights_daily, and the per-campaign
 * daily total (sum of its ads) to ad_spend_daily.
 * Auto-discovers ad accounts when possible — no CSV required.
 */
export async function syncMetaAdSpend(
  admin: SupabaseClient,
  accessToken: string,
  accountId: string,
  opts?: { days?: number; maxPages?: number }
): Promise<{ synced: number; errors: string[]; accounts: string[] }> {
  const errors: string[] = [];
  let synced = 0;
  const days = opts?.days ?? 30;
  const maxPages = opts?.maxPages ?? 20;

  const resolved = await resolveMetaAdAccountIds(accessToken, accountId);
  errors.push(...resolved.errors);
  if (!resolved.accounts.length) {
    return { synced: 0, errors, accounts: [] };
  }

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = istDateKey(since);
  const untilStr = istDateKey();

  for (const adAccountId of resolved.accounts) {
    const result = await syncOneAdAccount(
      admin,
      accessToken,
      adAccountId,
      sinceStr,
      untilStr,
      maxPages
    );
    synced += result.synced;
    errors.push(...result.errors);
  }

  return { synced, errors, accounts: resolved.accounts };
}

type Action = { action_type: string; value: string };

function actionValue(actions: Action[] | undefined, type: string): number {
  return Number(actions?.find((a) => a.action_type === type)?.value) || 0;
}

/** Meta's "lead" action already totals form + pixel leads; fall back to the parts. */
export function metaLeadCount(actions: Action[] | undefined): number {
  const total = actionValue(actions, "lead");
  if (total) return total;
  return (
    actionValue(actions, "onsite_conversion.lead_grouped") +
    actionValue(actions, "offsite_conversion.fb_pixel_lead")
  );
}

const UPSERT_BATCH = 500;

async function syncOneAdAccount(
  admin: SupabaseClient,
  accessToken: string,
  adAccountId: string,
  since: string,
  until: string,
  maxPages: number
): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = [];
  let synced = 0;

  const params = new URLSearchParams({
    fields:
      "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,reach,clicks,inline_link_clicks,actions,video_thruplay_watched_actions",
    time_range: JSON.stringify({ since, until }),
    time_increment: "1",
    level: "ad",
    limit: "500",
  });

  let nextUrl: string | null =
    `https://graph.facebook.com/v21.0/act_${adAccountId}/insights?${params}`;
  let pages = 0;

  const adRows: Record<string, unknown>[] = [];
  // campaign name → date → summed totals of its ads
  const campaignDays = new Map<string, Map<string, { spend: number; impressions: number; clicks: number }>>();

  while (nextUrl && pages < maxPages) {
    pages += 1;
    const res = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      errors.push(
        `act_${adAccountId} insights ${res.status}: ${(await res.text()).slice(0, 300)}`
      );
      break;
    }

    const body = (await res.json()) as {
      data?: MetaInsight[];
      error?: { message: string };
      paging?: { next?: string };
    };
    if (body.error) {
      errors.push(`act_${adAccountId}: ${body.error.message}`);
      break;
    }

    for (const row of body.data ?? []) {
      const date = row.date_start?.slice(0, 10);
      if (!date || !row.campaign_name || !row.ad_id) continue;
      const spend = Number(row.spend) || 0;
      const impressions = Number(row.impressions) || 0;
      const clicks = Number(row.clicks) || 0;

      adRows.push({
        ad_account_id: adAccountId,
        ad_id: row.ad_id,
        date,
        campaign_meta_id: row.campaign_id ?? null,
        campaign_name: row.campaign_name,
        adset_id: row.adset_id ?? null,
        adset_name: row.adset_name ?? null,
        ad_name: row.ad_name ?? row.ad_id,
        spend,
        impressions,
        reach: Number(row.reach) || 0,
        clicks,
        link_clicks: Number(row.inline_link_clicks) || 0,
        landing_page_views: actionValue(row.actions, "landing_page_view"),
        meta_leads: metaLeadCount(row.actions),
        video_plays_3s: actionValue(row.actions, "video_view"),
        thru_plays: Number(row.video_thruplay_watched_actions?.[0]?.value) || 0,
        synced_at: new Date().toISOString(),
      });

      let byDay = campaignDays.get(row.campaign_name);
      if (!byDay) {
        byDay = new Map();
        campaignDays.set(row.campaign_name, byDay);
      }
      const t = byDay.get(date) ?? { spend: 0, impressions: 0, clicks: 0 };
      t.spend += spend;
      t.impressions += impressions;
      t.clicks += clicks;
      byDay.set(date, t);
    }

    nextUrl = body.paging?.next ?? null;
  }
  if (nextUrl) {
    errors.push(`act_${adAccountId}: stopped after ${maxPages} pages — sync a shorter range`);
  }

  // Campaign ids once per campaign name, not once per row
  const campaignIds = new Map<string, string | null>();
  for (const name of Array.from(campaignDays.keys())) {
    campaignIds.set(name, (await ensureCampaign(admin, name))?.id ?? null);
  }
  for (const r of adRows) r.campaign_id = campaignIds.get(r.campaign_name as string) ?? null;

  for (let i = 0; i < adRows.length; i += UPSERT_BATCH) {
    const { error } = await admin
      .from("meta_ad_insights_daily")
      .upsert(adRows.slice(i, i + UPSERT_BATCH), { onConflict: "ad_account_id,ad_id,date" });
    if (error) errors.push(`meta_ad_insights_daily: ${error.message}`);
    else synced += Math.min(UPSERT_BATCH, adRows.length - i);
  }

  const spendRows: Record<string, unknown>[] = [];
  for (const [name, byDay] of Array.from(campaignDays.entries())) {
    const campaignId = campaignIds.get(name);
    if (!campaignId) continue;
    for (const [date, t] of Array.from(byDay.entries())) {
      spendRows.push({
        campaign_id: campaignId,
        date,
        spend: Math.round(t.spend * 100) / 100,
        impressions: t.impressions,
        clicks: t.clicks,
        ctr: t.impressions ? t.clicks / t.impressions : null,
        cpc: t.clicks ? t.spend / t.clicks : null,
      });
    }
  }
  for (let i = 0; i < spendRows.length; i += UPSERT_BATCH) {
    const { error } = await admin
      .from("ad_spend_daily")
      .upsert(spendRows.slice(i, i + UPSERT_BATCH), { onConflict: "campaign_id,date" });
    if (error) errors.push(`ad_spend_daily: ${error.message}`);
  }

  return { synced, errors };
}

async function ensureCampaign(
  admin: SupabaseClient,
  name: string
): Promise<{ id: string } | null> {
  const { data: camp } = await admin
    .from("campaigns")
    .select("id")
    .ilike("name", name)
    .limit(1)
    .maybeSingle();
  if (camp) return camp;

  const { data: metaCh } = await admin
    .from("channels")
    .select("id")
    .eq("name", "Meta")
    .maybeSingle();
  if (!metaCh) return null;

  const { data: created } = await admin
    .from("campaigns")
    .insert({
      channel_id: metaCh.id,
      name,
      source_type: "paid_ad",
      status: "active",
    })
    .select("id")
    .single();
  return created;
}

export type MetaSyncRun = {
  at: string;
  trigger: "auto" | "manual";
  ok: boolean;
  synced: number;
  days: number;
  durationMs: number;
  errors: string[];
};

/** Last runs kept in app_settings so the UI can show whether the nightly sync worked. */
export const META_SYNC_RUNS_KEY = "meta_sync_runs";
const KEEP_RUNS = 10;

export async function recordMetaSyncRun(admin: SupabaseClient, run: MetaSyncRun): Promise<void> {
  try {
    const { data } = await admin.from("app_settings").select("value").eq("key", META_SYNC_RUNS_KEY).maybeSingle();
    const prev = Array.isArray(data?.value) ? (data!.value as MetaSyncRun[]) : [];
    const next = [{ ...run, errors: run.errors.slice(0, 5).map((e) => e.slice(0, 300)) }, ...prev].slice(0, KEEP_RUNS);
    await admin.from("app_settings").upsert({ key: META_SYNC_RUNS_KEY, value: next, updated_at: new Date().toISOString() });
  } catch (err) {
    console.error("[meta-sync] could not record run", err);
  }
}

export async function fetchMetaSyncRuns(client: SupabaseClient): Promise<MetaSyncRun[]> {
  const { data } = await client.from("app_settings").select("value").eq("key", META_SYNC_RUNS_KEY).maybeSingle();
  return Array.isArray(data?.value) ? (data!.value as MetaSyncRun[]) : [];
}

/** Meta data older than this is refreshed when someone opens a marketing page. */
const META_FRESH_MINUTES = 30;
/** A sync started this recently is assumed still running — don't start another. */
const META_LOCK_MINUTES = 3;

/**
 * Keep Meta data live without anyone pressing "Sync now": called in the
 * background from every marketing page. Pulls today + yesterday (ad level)
 * when the last sync is older than META_FRESH_MINUTES. The nightly cron is
 * the backstop for days nobody opens the dashboards.
 * Called from /api/marketing/meta-autosync (a route, not a server action —
 * actions run one at a time per tab, so a slow Meta pull blocked saves).
 */
export async function autoSyncMetaIfStale(admin: SupabaseClient): Promise<{ ran: boolean; synced: number }> {

  const now = Date.now();
  const [runs, { data: lock }] = await Promise.all([
    fetchMetaSyncRuns(admin),
    admin.from("app_settings").select("value").eq("key", "meta_sync_lock").maybeSingle(),
  ]);
  const lastOk = runs.find((r) => r.ok);
  if (lastOk && now - new Date(lastOk.at).getTime() < META_FRESH_MINUTES * 60_000) return { ran: false, synced: 0 };
  const lockedAt = (lock?.value as { at?: string } | null)?.at;
  if (lockedAt && now - new Date(lockedAt).getTime() < META_LOCK_MINUTES * 60_000) return { ran: false, synced: 0 };
  await admin.from("app_settings").upsert({ key: "meta_sync_lock", value: { at: new Date(now).toISOString() } });

  const { data: connections } = await admin
    .from("ad_platform_connections")
    .select("account_id, access_token")
    .eq("status", "connected")
    .eq("platform", "meta");
  if (!connections?.length) return { ran: false, synced: 0 };

  let synced = 0;
  const errors: string[] = [];
  for (const conn of connections) {
    if (!conn.access_token || !conn.account_id) continue;
    const result = await syncMetaAdSpend(admin, conn.access_token, conn.account_id, { days: 1, maxPages: 6 });
    synced += result.synced;
    errors.push(...result.errors);
  }
  await recordMetaSyncRun(admin, {
    at: new Date().toISOString(),
    trigger: "auto",
    ok: synced > 0 || errors.length === 0,
    synced,
    days: 1,
    durationMs: Date.now() - now,
    errors,
  });
  // No cache wipe: dashboards re-read within their 90s TTL. Wiping every
  // marketing cache each half hour made the next page view a cold recompute.
  return { ran: true, synced };
}
