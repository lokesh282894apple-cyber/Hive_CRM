import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  findExistingLead,
  normalizeEmail,
  normalizePhone,
} from "@/lib/leads/identity";
import { dispatchStageTriggers } from "@/lib/integrations/dispatch";
import {
  getMetaPageAccessToken,
  getMetaWebhookVerifyToken,
} from "@/lib/integrations/meta-credentials";

/**
 * Meta Lead Ads webhook.
 * GET: hub challenge verification
 * POST: leadgen notifications → fetch lead → upsert with phone dedup
 *
 * Page access token: Admin → Marketing → Connections (Meta), else env.
 */
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  const expected = await getMetaWebhookVerifyToken();

  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: true });

  const admin = createAdminClient();
  const entries = (body.entry ?? []) as Array<{
    changes?: Array<{
      field?: string;
      value?: {
        leadgen_id?: string;
        page_id?: string;
        form_id?: string;
        ad_id?: string;
        adgroup_id?: string;
        created_time?: number;
      };
    }>;
  }>;

  let ingested = 0;
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen" || !change.value?.leadgen_id) continue;
      const leadgenId = change.value.leadgen_id;
      try {
        const fields = await fetchMetaLead(leadgenId);
        if (!fields) continue;

        const name =
          fields.full_name ||
          [fields.first_name, fields.last_name].filter(Boolean).join(" ") ||
          "Meta lead";
        const phone = normalizePhone(fields.phone_number || fields.phone || "");
        const email = normalizeEmail(fields.email || null);
        if (!phone) continue;

        const match = await findExistingLead(admin, phone, email);
        let leadId: string;
        let created = false;

        const attribution = {
          campaign_id: fields.campaign_id || change.value.adgroup_id || null,
          adset_id: change.value.adgroup_id || null,
          ad_id: change.value.ad_id || null,
          form_id: change.value.form_id || null,
          campaign_name: fields.campaign_name || null,
        };

        if (match) {
          leadId = match.lead.id;
          await admin
            .from("leads")
            .update({
              name,
              phone,
              ...(email ? { email } : {}),
              source: match.lead.source || "meta_ad",
              utm_source: "meta",
              utm_medium: "paid",
              utm_campaign: attribution.campaign_name || attribution.campaign_id,
              meta_leadgen_id: leadgenId,
              meta_campaign_name: attribution.campaign_name,
              meta_ad_set: change.value.adgroup_id ?? null,
              meta_ad_name: change.value.ad_id ?? null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", leadId);
        } else {
          const { data, error } = await admin
            .from("leads")
            .insert({
              name,
              phone,
              email,
              source: "meta_ad",
              stage: "new_lead",
              utm_source: "meta",
              utm_medium: "paid",
              utm_campaign: attribution.campaign_name || attribution.campaign_id,
              meta_leadgen_id: leadgenId,
              meta_campaign_name: attribution.campaign_name,
              meta_ad_set: change.value.adgroup_id ?? null,
              meta_ad_name: change.value.ad_id ?? null,
            })
            .select("id")
            .single();
          if (error || !data) continue;
          leadId = data.id;
          created = true;
        }

        await admin.from("lead_touchpoints").insert({
          lead_id: leadId,
          source: "meta_lead_ads",
          channel: "meta",
          campaign_id: attribution.campaign_id,
          adset_id: attribution.adset_id,
          ad_id: attribution.ad_id,
          campaign_name: attribution.campaign_name,
          form_id: attribution.form_id,
          external_id: leadgenId,
          payload: fields,
        });

        if (created) {
          await dispatchStageTriggers(admin, { leadId, triggerKey: "new_lead" });
        }
        ingested += 1;
      } catch (err) {
        console.error("[meta/leadgen]", leadgenId, err);
      }
    }
  }

  return NextResponse.json({ ok: true, ingested });
}

async function fetchMetaLead(
  leadgenId: string
): Promise<Record<string, string> | null> {
  const token = await getMetaPageAccessToken();
  if (!token) {
    console.warn(
      "[meta/leadgen] No Meta token — save one under Admin → Marketing → Connections, or set META_PAGE_ACCESS_TOKEN"
    );
    return null;
  }
  const url = `https://graph.facebook.com/v19.0/${leadgenId}?access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    field_data?: { name: string; values: string[] }[];
    campaign_id?: string;
    ad_id?: string;
    adset_id?: string;
  };
  const out: Record<string, string> = {};
  for (const f of data.field_data ?? []) {
    const key = f.name.toLowerCase().replace(/\s+/g, "_");
    out[key] = f.values?.[0] ?? "";
  }
  if (data.campaign_id) out.campaign_id = data.campaign_id;
  if (data.ad_id) out.ad_id = data.ad_id;
  if (data.adset_id) out.adset_id = data.adset_id;
  return out;
}
