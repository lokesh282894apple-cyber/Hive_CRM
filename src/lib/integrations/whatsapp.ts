import "server-only";
import { toE164India } from "@/lib/integrations/phone";

export type SendWaResult =
  | { ok: true; id: string }
  | { ok: false; error: string; skipped?: boolean };

export function isWhatsAppConfigured() {
  return Boolean(
    process.env.AISENSY_API_KEY ||
      (process.env.META_WA_TOKEN && process.env.META_WA_PHONE_NUMBER_ID)
  );
}

/**
 * Send a pre-approved template.
 * Prefers AiSensy if AISENSY_API_KEY set; else Meta Cloud API.
 */
export async function sendWhatsAppTemplate(opts: {
  toPhone: string;
  templateName: string;
  language?: string;
  bodyParams?: string[];
}): Promise<SendWaResult> {
  const e164 = toE164India(opts.toPhone);
  if (!e164) return { ok: false, error: "Invalid phone for WhatsApp" };

  if (process.env.AISENSY_API_KEY) {
    return sendViaAisensy({
      to: e164,
      templateName: opts.templateName,
      language: opts.language || "en",
      bodyParams: opts.bodyParams ?? [],
    });
  }

  if (process.env.META_WA_TOKEN && process.env.META_WA_PHONE_NUMBER_ID) {
    return sendViaMetaCloud({
      to: e164.replace("+", ""),
      templateName: opts.templateName,
      language: opts.language || "en",
      bodyParams: opts.bodyParams ?? [],
    });
  }

  return {
    ok: false,
    skipped: true,
    error: "WhatsApp not configured (AISENSY_API_KEY or META_WA_*)",
  };
}

async function sendViaAisensy(opts: {
  to: string;
  templateName: string;
  language: string;
  bodyParams: string[];
}): Promise<SendWaResult> {
  const campaignUrl =
    process.env.AISENSY_CAMPAIGN_URL ||
    "https://backend.aisensy.com/campaign/t1/api/v2";

  const res = await fetch(campaignUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.AISENSY_API_KEY}`,
    },
    body: JSON.stringify({
      apiKey: process.env.AISENSY_API_KEY,
      campaignName: opts.templateName,
      destination: opts.to,
      userName: opts.bodyParams[0] || "Candidate",
      templateParams: opts.bodyParams,
      source: "hive-crm",
      language: opts.language,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    submitted_message_id?: string;
    error?: string;
    message?: string;
  };

  if (!res.ok || body.success === false) {
    return {
      ok: false,
      error: body.error || body.message || `AiSensy HTTP ${res.status}`,
    };
  }
  return { ok: true, id: body.submitted_message_id || "aisensy-sent" };
}

async function sendViaMetaCloud(opts: {
  to: string;
  templateName: string;
  language: string;
  bodyParams: string[];
}): Promise<SendWaResult> {
  const phoneId = process.env.META_WA_PHONE_NUMBER_ID!;
  const token = process.env.META_WA_TOKEN!;
  const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;

  const components =
    opts.bodyParams.length > 0
      ? [
          {
            type: "body",
            parameters: opts.bodyParams.map((text) => ({ type: "text", text })),
          },
        ]
      : undefined;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: opts.to,
      type: "template",
      template: {
        name: opts.templateName,
        language: { code: opts.language },
        components,
      },
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    messages?: { id: string }[];
    error?: { message?: string };
  };

  if (!res.ok) {
    return { ok: false, error: body.error?.message || `Meta WA HTTP ${res.status}` };
  }
  return { ok: true, id: body.messages?.[0]?.id || "meta-sent" };
}
