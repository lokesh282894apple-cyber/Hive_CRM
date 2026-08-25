import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Prefer Meta token saved in CRM (Admin → Marketing → Connections),
 * fall back to META_PAGE_ACCESS_TOKEN / META_WA_TOKEN env.
 */
export async function getMetaPageAccessToken(): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("ad_platform_connections")
      .select("access_token")
      .eq("platform", "meta")
      .eq("status", "connected")
      .not("access_token", "is", null)
      .order("connected_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.access_token) return String(data.access_token);
  } catch (err) {
    console.warn("[meta] could not read ad_platform_connections", err);
  }
  return (
    process.env.META_PAGE_ACCESS_TOKEN ||
    process.env.META_WA_TOKEN ||
    null
  );
}

/** Webhook verify token: app_settings key, then env. */
export async function getMetaWebhookVerifyToken(): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", "meta_webhook_verify_token")
      .maybeSingle();
    if (data?.value != null) {
      const v =
        typeof data.value === "string"
          ? data.value.replace(/^"|"$/g, "")
          : typeof data.value === "object" &&
              data.value &&
              "token" in (data.value as object)
            ? String((data.value as { token: string }).token)
            : null;
      if (v?.trim()) return v.trim();
    }
  } catch {
    /* ignore */
  }
  return process.env.META_WEBHOOK_VERIFY_TOKEN || null;
}
