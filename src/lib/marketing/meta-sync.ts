import type { SupabaseClient } from "@supabase/supabase-js";

type MetaInsight = {
  date_start: string;
  date_stop: string;
  campaign_name?: string;
  adset_name?: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
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
 * Pull daily ad-level spend + insight rows from Meta Marketing API.
 * Auto-discovers ad accounts when possible — no CSV required.
 */
export async function syncMetaAdSpend(
  admin: SupabaseClient,
  accessToken: string,
  accountId: string,
  opts?: { days?: number }
): Promise<{ synced: number; errors: string[]; accounts: string[] }> {
  const errors: string[] = [];
  let synced = 0;
  const days = opts?.days ?? 30;

  const resolved = await resolveMetaAdAccountIds(accessToken, accountId);
  errors.push(...resolved.errors);
  if (!resolved.accounts.length) {
    return { synced: 0, errors, accounts: [] };
  }

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);
  const untilStr = new Date().toISOString().slice(0, 10);

  for (const adAccountId of resolved.accounts) {
    const result = await syncOneAdAccount(
      admin,
      accessToken,
      adAccountId,
      sinceStr,
      untilStr
    );
    synced += result.synced;
    errors.push(...result.errors);
  }

  return { synced, errors, accounts: resolved.accounts };
}

async function syncOneAdAccount(
  admin: SupabaseClient,
  accessToken: string,
  adAccountId: string,
  since: string,
  until: string
): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = [];
  let synced = 0;

  const params = new URLSearchParams({
    fields:
      "campaign_name,adset_name,ad_name,spend,impressions,clicks,reach,actions,video_thruplay_watched_actions",
    time_range: JSON.stringify({ since, until }),
    time_increment: "1",
    level: "ad",
    limit: "500",
  });

  let nextUrl: string | null =
    `https://graph.facebook.com/v21.0/act_${adAccountId}/insights?${params}`;

  while (nextUrl) {
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
      if (!date || !row.campaign_name) continue;
      const spend = Number(row.spend) || 0;
      const impressions = Number(row.impressions) || 0;
      const clicks = Number(row.clicks) || 0;
      const leads =
        Number(
          row.actions?.find(
            (a) =>
              a.action_type === "lead" ||
              a.action_type === "onsite_conversion.lead_grouped"
          )?.value
        ) || 0;

      const camp = await ensureCampaign(admin, row.campaign_name);
      if (camp) {
        const { error } = await admin.from("ad_spend_daily").upsert(
          {
            campaign_id: camp.id,
            date,
            spend,
            impressions,
            clicks,
            ctr: impressions ? clicks / impressions : null,
            cpc: clicks ? spend / clicks : null,
          },
          { onConflict: "campaign_id,date" }
        );
        if (!error) synced += 1;
      }

      const thru = Number(row.video_thruplay_watched_actions?.[0]?.value) || 0;

      await admin.from("ad_insights_weekly").upsert(
        {
          week_label: `W${getWeekNum(new Date(date))}`,
          week_start: mondayOf(date),
          campaign_name: row.campaign_name,
          ad_set_name: row.adset_name ?? null,
          ad_name: row.ad_name ?? row.campaign_name,
          spend,
          results: leads,
          reach: Number(row.reach) || 0,
          impressions,
          link_clicks: clicks,
          thru_plays: thru,
          source: "api",
          campaign_id: camp?.id ?? null,
        },
        { onConflict: "week_start,campaign_name,ad_set_name,ad_name" }
      );
    }

    nextUrl = body.paging?.next ?? null;
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

function mondayOf(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function getWeekNum(d: Date): number {
  const onejan = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(
    ((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7
  );
}
