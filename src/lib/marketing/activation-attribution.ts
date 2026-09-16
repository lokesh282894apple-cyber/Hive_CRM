import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActivationAttributionRow = {
  id: string;
  activity: string;
  activity_type: string | null;
  channel: string | null;
  attribution_token: string | null;
  attribution_window_days: number | null;
  planned_date: string | null;
  actual_date: string | null;
  status: string;
};

export type AttributedLeadHit = {
  leadId: string;
  matchReason: "token" | "channel_window" | "source_window";
};

/** Channel → substrings matched against utm_source / source / utm_medium */
const CHANNEL_PATTERNS: Record<string, string[]> = {
  linkedin: ["linkedin", "li"],
  "linkedin (organic)": ["linkedin", "li"],
  instagram: ["instagram", "ig"],
  youtube: ["youtube", "yt"],
  whatsapp: ["whatsapp", "wa", "w.app"],
  google: ["google", "adwords", "googleads"],
  meta: ["meta", "facebook", "fb"],
  "organic other": ["organic", "referral", "other"],
  twitter: ["twitter", "x.com"],
};

function normalize(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function eventDate(a: ActivationAttributionRow): string | null {
  const d = a.actual_date || a.planned_date;
  return d ? String(d).slice(0, 10) : null;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function channelPatterns(channel: string | null): string[] {
  const key = normalize(channel);
  if (!key) return [];
  if (CHANNEL_PATTERNS[key]) return CHANNEL_PATTERNS[key];
  return [key];
}

function textHasAny(hay: string, needles: string[]): boolean {
  if (!hay || !needles.length) return false;
  return needles.some((n) => n.length > 0 && hay.includes(n));
}

/**
 * Simer attribution: credit every lead in the go-live window that matches
 * the activation token OR channel — not only last-click campaign ids.
 */
export function matchLeadToActivation(
  lead: {
    id: string;
    created_at: string;
    source: string | null;
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
  },
  activation: ActivationAttributionRow
): AttributedLeadHit | null {
  const start = eventDate(activation);
  if (!start) return null;
  const windowDays = Math.max(1, Number(activation.attribution_window_days) || 7);
  const end = addDays(start, windowDays);
  const created = String(lead.created_at).slice(0, 10);
  if (created < start || created > end) return null;

  const blob = [
    lead.utm_campaign,
    lead.utm_source,
    lead.utm_medium,
    lead.source,
  ]
    .map(normalize)
    .join(" ");

  const token = normalize(activation.attribution_token);
  if (token && blob.includes(token)) {
    return { leadId: lead.id, matchReason: "token" };
  }

  const patterns = channelPatterns(activation.channel);
  if (patterns.length) {
    const src = normalize(lead.utm_source);
    const medium = normalize(lead.utm_medium);
    const source = normalize(lead.source);
    if (
      textHasAny(src, patterns) ||
      textHasAny(medium, patterns) ||
      textHasAny(source, patterns)
    ) {
      return { leadId: lead.id, matchReason: "channel_window" };
    }
  }

  // Token-less + channel-less: activity name as soft token (min 4 chars)
  const activityToken = normalize(activation.activity).replace(/\s+/g, "-");
  if (activityToken.length >= 4 && blob.includes(activityToken)) {
    return { leadId: lead.id, matchReason: "source_window" };
  }

  return null;
}

export async function recomputeActivationAttribution(
  activationId: string,
  client?: SupabaseClient
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const db = client ?? createAdminClient();

  const { data: activation, error: actErr } = await db
    .from("marketing_activations")
    .select(
      "id, activity, activity_type, channel, attribution_token, attribution_window_days, planned_date, actual_date, status"
    )
    .eq("id", activationId)
    .maybeSingle();

  if (actErr) return { ok: false, error: actErr.message };
  if (!activation) return { ok: false, error: "Activation not found" };

  const row = activation as ActivationAttributionRow;
  const start = eventDate(row);

  // Clear existing links
  await db.from("marketing_activation_leads").delete().eq("activation_id", activationId);

  if (!start || row.status !== "done") {
    await db
      .from("marketing_activations")
      .update({
        attributed_leads_count: 0,
        delivered_qty: 0,
        output_metric: "leads",
        output_value: 0,
      })
      .eq("id", activationId);
    return { ok: true, count: 0 };
  }

  // Simer window: go-live date → +N days; credit every matching lead (not last-click only)
  const windowDays = Math.max(1, Number(row.attribution_window_days) || 7);
  const end = addDays(start, windowDays);
  const fromIso = `${start}T00:00:00.000Z`;
  const toIso = `${end}T23:59:59.999Z`;

  const { data: leads, error: leadErr } = await db
    .from("leads")
    .select("id, created_at, source, utm_source, utm_medium, utm_campaign")
    .gte("created_at", fromIso)
    .lte("created_at", toIso);

  if (leadErr) return { ok: false, error: leadErr.message };

  const hits: AttributedLeadHit[] = [];
  for (const lead of leads ?? []) {
    const hit = matchLeadToActivation(lead, row);
    if (hit) hits.push(hit);
  }

  if (hits.length) {
    const { error: insErr } = await db.from("marketing_activation_leads").insert(
      hits.map((h) => ({
        activation_id: activationId,
        lead_id: h.leadId,
        match_reason: h.matchReason,
      }))
    );
    if (insErr) return { ok: false, error: insErr.message };
  }

  const count = hits.length;
  const { error: updErr } = await db
    .from("marketing_activations")
    .update({
      attributed_leads_count: count,
      delivered_qty: count,
      output_metric: "leads",
      output_value: count,
      actual_date: row.actual_date || start,
    })
    .eq("id", activationId);

  if (updErr) return { ok: false, error: updErr.message };
  return { ok: true, count };
}

export async function recomputeMonthActivationAttribution(
  monthKey: string,
  client?: SupabaseClient
): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  const db = client ?? createAdminClient();
  const { data, error } = await db
    .from("marketing_activations")
    .select("id")
    .eq("month_key", monthKey);
  if (error) return { ok: false, error: error.message };

  let updated = 0;
  for (const a of data ?? []) {
    const res = await recomputeActivationAttribution(a.id as string, db);
    if (!res.ok) return res;
    updated += 1;
  }
  return { ok: true, updated };
}
