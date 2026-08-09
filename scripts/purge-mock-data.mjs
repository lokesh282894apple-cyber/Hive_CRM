/**
 * Remove planted mock / smoke-test leads (and obvious smoke campaigns).
 * Keeps: real website form leads, courses, users, channels, live sessions/events.
 *
 * Usage: node --env-file=.env.local scripts/purge-mock-data.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function isMockLead(lead) {
  const name = (lead.name || "").toLowerCase();
  const email = (lead.email || "").toLowerCase();
  const phone = String(lead.phone || "").replace(/\D/g, "");

  if (/^sample lead\s*\d+/i.test(lead.name || "")) return true;
  if (/@(example\.com|test\.com)$/i.test(email)) return true;
  if (
    /^(smoke|deploy probe|post deploy|contract smoke|dual\b)/i.test(name) ||
    name.includes("upsert")
  ) {
    return true;
  }
  // Our API smoke phones
  if (/^999000(1111|2222|3333|4444|5555|6666)$/.test(phone)) return true;
  if (/^98888111(00|01|99)$/.test(phone)) return true;
  if (/^97777369617$/.test(phone)) return true;

  return false;
}

const SMOKE_CAMPAIGN_NAMES = new Set([
  "crm-contract",
  "crm-fix",
  "post-lint-fix",
]);

async function main() {
  const { data: leads, error } = await admin
    .from("leads")
    .select("id,name,phone,email,source");
  if (error) throw error;

  const toDelete = (leads ?? []).filter(isMockLead);
  const keep = (leads ?? []).filter((l) => !isMockLead(l));

  console.log("Keeping leads:");
  for (const l of keep) {
    console.log(`  ✓ ${l.name} (${l.phone}) · ${l.source}`);
  }
  console.log("\nDeleting mock/smoke leads:");
  for (const l of toDelete) {
    console.log(`  ✗ ${l.name} (${l.phone}) · ${l.email ?? "—"}`);
  }

  if (toDelete.length) {
    const ids = toDelete.map((l) => l.id);
    // lead_attribution / stage_history / call_logs cascade from leads
    const { error: delErr } = await admin.from("leads").delete().in("id", ids);
    if (delErr) throw delErr;
    console.log(`\nDeleted ${ids.length} leads.`);
  } else {
    console.log("\nNo mock leads to delete.");
  }

  const { data: camps } = await admin.from("campaigns").select("id,name");
  const smokeCamps = (camps ?? []).filter((c) => SMOKE_CAMPAIGN_NAMES.has(c.name));
  if (smokeCamps.length) {
    const { error: cErr } = await admin
      .from("campaigns")
      .delete()
      .in(
        "id",
        smokeCamps.map((c) => c.id)
      );
    if (cErr) console.warn("Campaign delete:", cErr.message);
    else console.log(`Deleted ${smokeCamps.length} smoke campaigns.`);
  }

  const { count: leadCount } = await admin
    .from("leads")
    .select("*", { count: "exact", head: true });
  console.log(`\nLeads remaining: ${leadCount}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
