import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateCronAuth } from "@/lib/marketing/track-auth";
import { viewportBreakpoint } from "@/lib/marketing/attribution";

export async function GET(request: NextRequest) {
  return POST(request);
}

/**
 * Daily heatmap rollup: click events → heatmap_points buckets.
 * Auth: Bearer CRON_SECRET or CRM_TRACK_API_KEY.
 */
export async function POST(request: NextRequest) {
  if (!validateCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: settings } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "heatmap_bucket_size")
    .maybeSingle();

  const bucketSize =
    typeof settings?.value === "number"
      ? settings.value
      : Number(settings?.value) || 20;

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const { data: events, error } = await admin
    .from("page_events")
    .select("page_url, x, y, viewport_width")
    .eq("event_type", "click")
    .not("x", "is", null)
    .not("y", "is", null)
    .gte("occurred_at", since.toISOString())
    .limit(50000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const aggregates = new Map<
    string,
    { page_url: string; x_bucket: number; y_bucket: number; viewport_breakpoint: string; click_count: number }
  >();

  for (const ev of events ?? []) {
    if (ev.x == null || ev.y == null) continue;
    const bp = viewportBreakpoint(ev.viewport_width);
    const xBucket = Math.floor(ev.x / bucketSize) * bucketSize;
    const yBucket = Math.floor(ev.y / bucketSize) * bucketSize;
    const key = `${ev.page_url}|${xBucket}|${yBucket}|${bp}`;
    const row = aggregates.get(key);
    if (row) row.click_count += 1;
    else {
      aggregates.set(key, {
        page_url: ev.page_url,
        x_bucket: xBucket,
        y_bucket: yBucket,
        viewport_breakpoint: bp,
        click_count: 1,
      });
    }
  }

  let upserted = 0;
  const now = new Date().toISOString();
  const rows = Array.from(aggregates.values());

  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    for (const row of chunk) {
      const { data: existing } = await admin
        .from("heatmap_points")
        .select("click_count")
        .eq("page_url", row.page_url)
        .eq("x_bucket", row.x_bucket)
        .eq("y_bucket", row.y_bucket)
        .eq("viewport_breakpoint", row.viewport_breakpoint)
        .maybeSingle();

      if (existing) {
        await admin
          .from("heatmap_points")
          .update({
            click_count: existing.click_count + row.click_count,
            last_updated_at: now,
          })
          .eq("page_url", row.page_url)
          .eq("x_bucket", row.x_bucket)
          .eq("y_bucket", row.y_bucket)
          .eq("viewport_breakpoint", row.viewport_breakpoint);
      } else {
        await admin.from("heatmap_points").insert({
          ...row,
          last_updated_at: now,
        });
      }
      upserted += 1;
    }
  }

  return NextResponse.json({ ok: true, events: (events ?? []).length, upserted });
}
