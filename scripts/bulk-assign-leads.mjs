/**
 * Randomly assign leads to 2 counselors (50/50 shuffle).
 *
 * Usage:
 *   node --env-file=.env.local scripts/bulk-assign-leads.mjs
 *   node --env-file=.env.local scripts/bulk-assign-leads.mjs --apply
 *   node --env-file=.env.local scripts/bulk-assign-leads.mjs --emails=a@x.com,b@y.com --apply
 *
 * Defaults:
 *   - Dry-run (no writes) unless --apply
 *   - Leads created in August of the current year
 *   - Only unassigned leads (lead_allocated_to is null)
 *   - Uses the 2 active counselors in users (or --emails)
 *
 * Flags:
 *   --from=YYYY-MM-DD --to=YYYY-MM-DD   created_at window (to is exclusive)
 *   --all-assigned                      include already-assigned leads (reassign)
 *   --emails=email1,email2              pick exact counselors
 *   --apply                             write updates
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? "true"] : [a, "true"];
  })
);

const apply = args.apply === "true";
const includeAssigned = args["all-assigned"] === "true";
const year = new Date().getFullYear();
const from = args.from || `${year}-08-01`;
const to = args.to || `${year}-09-01`;

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function fetchAllLeads(queryBuilder) {
  const pageSize = 1000;
  const rows = [];
  for (let fromIdx = 0; ; fromIdx += pageSize) {
    const { data, error } = await queryBuilder.range(fromIdx, fromIdx + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function main() {
  console.log(`DB: ${url}`);
  console.log(`Window: created_at >= ${from} AND < ${to}`);
  console.log(`Mode: ${apply ? "APPLY (writes)" : "DRY-RUN (no writes)"}`);
  console.log(`Scope: ${includeAssigned ? "all matching leads" : "unassigned only"}`);

  const { data: allCounselors, error: cErr } = await admin
    .from("users")
    .select("id, name, email, role, active")
    .eq("role", "counselor")
    .order("name");
  if (cErr) throw cErr;

  console.log("\nActive counselors in users:");
  for (const c of (allCounselors ?? []).filter((u) => u.active)) {
    console.log(`  - ${c.name} <${c.email}> ${c.id}`);
  }
  const inactive = (allCounselors ?? []).filter((u) => !u.active);
  if (inactive.length) {
    console.log("Inactive counselors (ignored):");
    for (const c of inactive) console.log(`  - ${c.name} <${c.email}>`);
  }

  let counselors = (allCounselors ?? []).filter((u) => u.active);
  if (args.emails) {
    const wanted = args.emails.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    counselors = counselors.filter((c) => wanted.includes(c.email.toLowerCase()));
    if (counselors.length !== wanted.length) {
      const found = new Set(counselors.map((c) => c.email.toLowerCase()));
      const missing = wanted.filter((e) => !found.has(e));
      console.error(`\nCould not find active counselors for: ${missing.join(", ")}`);
      process.exit(1);
    }
  }

  if (counselors.length !== 2) {
    console.error(
      `\nNeed exactly 2 counselors to split between. Found ${counselors.length}.` +
        `\nPass --emails=person1@…,person2@… after creating them in Admin → Users.`
    );
    process.exit(1);
  }

  let q = admin
    .from("leads")
    .select("id, name, email, stage, lead_allocated_to, created_at")
    .gte("created_at", `${from}T00:00:00.000Z`)
    .lt("created_at", `${to}T00:00:00.000Z`)
    .order("created_at", { ascending: true });
  if (!includeAssigned) q = q.is("lead_allocated_to", null);

  const leads = await fetchAllLeads(q);
  console.log(`\nMatching leads: ${leads.length}`);
  if (!leads.length) {
    console.log("Nothing to assign.");
    return;
  }

  const shuffled = shuffle([...leads]);
  const [a, b] = counselors;
  const plan = shuffled.map((lead, i) => ({
    lead,
    counselor: i % 2 === 0 ? a : b,
  }));

  const counts = { [a.id]: 0, [b.id]: 0 };
  for (const p of plan) counts[p.counselor.id]++;

  console.log(`\nPlan:`);
  console.log(`  ${a.name} <${a.email}> → ${counts[a.id]} leads`);
  console.log(`  ${b.name} <${b.email}> → ${counts[b.id]} leads`);
  console.log(`\nSample (first 10):`);
  for (const p of plan.slice(0, 10)) {
    console.log(
      `  ${p.lead.name || p.lead.email || p.lead.id} → ${p.counselor.name}`
    );
  }

  if (!apply) {
    console.log(`\nDry-run only. Re-run with --apply to write.`);
    return;
  }

  const byCounselor = new Map();
  for (const p of plan) {
    const list = byCounselor.get(p.counselor.id) ?? [];
    list.push(p.lead.id);
    byCounselor.set(p.counselor.id, list);
  }

  for (const [counselorId, ids] of byCounselor) {
    const chunk = 200;
    for (let i = 0; i < ids.length; i += chunk) {
      const slice = ids.slice(i, i + chunk);
      const { error } = await admin
        .from("leads")
        .update({ lead_allocated_to: counselorId })
        .in("id", slice);
      if (error) throw error;
    }
  }

  console.log(`\nDone. Assigned ${plan.length} leads.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
