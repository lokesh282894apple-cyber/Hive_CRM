// Daily CRM health check — READ ONLY. Finds data / tracking / metric problems
// before the team runs into them. Run: npm run health
//
// Each check prints ✅ or ⚠ with the count and a few examples. Thresholds are
// deliberately conservative: a ⚠ means "look at this", not "broken".

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRM = "https://hivecrm-nu.vercel.app";
const SITE = "https://hiveschool.co";
if (!URL || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env.local)");
  process.exit(1);
}

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
async function get(path) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const sep = path.includes("?") ? "&" : "?";
    const r = await fetch(`${URL}/rest/v1/${path}${sep}limit=1000&offset=${off}`, { headers: H });
    if (!r.ok) throw new Error(`${path}: ${r.status} ${(await r.text()).slice(0, 150)}`);
    const d = await r.json();
    out.push(...d);
    if (d.length < 1000) return out;
  }
}
async function count(path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { ...H, Prefer: "count=exact", Range: "0-0" },
  });
  return Number((r.headers.get("content-range") || "/0").split("/")[1]) || 0;
}

const IST = 330 * 60_000;
const istDate = (iso) => new Date(new Date(iso).getTime() + IST);
const istHour = (iso) => istDate(iso).getUTCHours();
const istDay = (iso) => istDate(iso).toISOString().slice(0, 10);
const now = Date.now();
const hoursAgo = (h) => new Date(now - h * 3600_000).toISOString();
const daysAgo = (d) => new Date(now - d * 86400_000).toISOString();

const results = [];
function report(area, name, problems, examples = [], note = "") {
  results.push({ area, name, ok: problems === 0, problems, examples: examples.slice(0, 4), note });
}
async function check(area, name, fn) {
  try {
    await fn();
  } catch (e) {
    results.push({ area, name, ok: false, problems: "error", examples: [String(e.message || e)], note: "" });
  }
}

const users = await get("users?select=id,name,role,active");
const userName = new Map(users.map((u) => [u.id, (u.name || "").trim()]));
const counselors = users.filter((u) => u.role === "counselor" && u.active);

// ── Tracking & intake ──────────────────────────────────────────────
await check("Tracking", "Website sends to the new CRM", async () => {
  const html = await (await fetch(SITE)).text();
  const base = (html.match(/crmBase:\s*"([^"]+)"/) || [])[1] || "(not found)";
  report("Tracking", "Website sends to the new CRM", base.startsWith(CRM) ? 0 : 1, [`crmBase = ${base}`]);
});
await check("Tracking", "Website visits in the last 3 hours", async () => {
  const n = await count(`visitor_sessions?select=id&first_seen_at=gte.${hoursAgo(3)}`);
  report("Tracking", "Website visits in the last 3 hours", n > 0 ? 0 : 1, [`${n} visits`],
    "0 during the day usually means tracking broke");
});
await check("Tracking", "New leads in the last 12 hours", async () => {
  const n = await count(`leads?select=id&created_at=gte.${hoursAgo(12)}`);
  report("Tracking", "New leads in the last 12 hours", n > 0 ? 0 : 1, [`${n} leads`]);
});
await check("Tracking", "Paid-ad visits matched to an organic campaign (last 2 days)", async () => {
  const camps = new Map((await get("campaigns?select=id,source_type")).map((c) => [c.id, c.source_type]));
  const s = await get(`visitor_sessions?select=id,utm_campaign,matched_campaign_id&utm_medium=eq.paid&first_seen_at=gte.${daysAgo(2)}`);
  const bad = s.filter((x) => camps.get(x.matched_campaign_id) === "organic");
  report("Tracking", "Paid-ad visits matched to an organic campaign (last 2 days)", bad.length,
    bad.map((x) => x.utm_campaign || "(no utm_campaign)"));
});
await check("Tracking", "Duplicate campaigns", async () => {
  const c = await get("campaigns?select=channel_id,name,source_type");
  const seen = new Map();
  for (const r of c) {
    const k = `${r.channel_id}|${r.name}|${r.source_type}`;
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  const dups = [...seen.entries()].filter(([, n]) => n > 1);
  report("Tracking", "Duplicate campaigns", dups.length, dups.map(([k, n]) => `${k.split("|")[1]} ×${n}`));
});
await check("Tracking", "Campaign names with un-filled ad placeholders", async () => {
  const c = await get("campaigns?select=name&name=like.*%7B%7B*");
  report("Tracking", "Campaign names with un-filled ad placeholders", c.length, c.map((x) => x.name),
    "Meta ad URL parameters like {{campaign.name}} not filled — fix in Ads Manager");
});

// ── Leads ──────────────────────────────────────────────────────────
const leads = await get("leads?select=id,name,phone,email,stage,course_id,cohort_id,lead_allocated_to,created_at,source,website_session_id");
const cohorts = await get("cohorts?select=id,course_id,name,active,intake_end");
const scope = await get("counselor_scope?select=user_id,course_id,cohort_id");
const stages = await get("funnel_stages?select=slug,active,show_on_board");

await check("Leads", "Leads with no owner", async () => {
  const x = leads.filter((l) => !l.lead_allocated_to);
  report("Leads", "Leads with no owner", x.length, x.map((l) => `${l.name} (${istDay(l.created_at)})`),
    "Assign from Bulk Assign");
});
await check("Leads", "Leads owned by an inactive / non-counselor user", async () => {
  const act = new Set(counselors.map((c) => c.id));
  const x = leads.filter((l) => l.lead_allocated_to && !act.has(l.lead_allocated_to));
  report("Leads", "Leads owned by an inactive / non-counselor user", x.length,
    x.map((l) => `${l.name} → ${userName.get(l.lead_allocated_to) || l.lead_allocated_to}`));
});
await check("Leads", "Owner can't open the lead (course / cohort outside their access)", async () => {
  const x = leads.filter((l) => {
    if (!l.lead_allocated_to || !counselors.some((c) => c.id === l.lead_allocated_to)) return false;
    return !scope.some((s) => s.user_id === l.lead_allocated_to &&
      (!l.course_id || s.course_id === l.course_id) && (!l.cohort_id || s.cohort_id === l.cohort_id));
  });
  report("Leads", "Owner can't open the lead (course / cohort outside their access)", x.length,
    x.map((l) => `${l.name} → ${userName.get(l.lead_allocated_to)}`), "Users & Roles → Edit → tick the course");
});
await check("Leads", "Course set but no cohort", async () => {
  const x = leads.filter((l) => l.course_id && !l.cohort_id);
  report("Leads", "Course set but no cohort", x.length, x.map((l) => l.name));
});
await check("Leads", "Cohort that belongs to another course", async () => {
  const byId = new Map(cohorts.map((c) => [c.id, c]));
  const x = leads.filter((l) => l.cohort_id && byId.get(l.cohort_id)?.course_id !== l.course_id);
  report("Leads", "Cohort that belongs to another course", x.length, x.map((l) => l.name));
});
await check("Leads", "Same phone on more than one lead", async () => {
  const m = new Map();
  for (const l of leads) {
    const p = String(l.phone || "").replace(/\D/g, "").slice(-10);
    if (p.length === 10) m.set(p, [...(m.get(p) || []), l.name]);
  }
  const d = [...m.entries()].filter(([, v]) => v.length > 1);
  report("Leads", "Same phone on more than one lead", d.length, d.map(([p, v]) => `${p}: ${v.join(" / ")}`));
});
await check("Leads", "Leads in a stage that's inactive or missing from the funnel", async () => {
  const active = new Set(stages.filter((s) => s.active).map((s) => s.slug));
  const x = leads.filter((l) => !active.has(l.stage));
  const by = {};
  for (const l of x) by[l.stage] = (by[l.stage] || 0) + 1;
  report("Leads", "Leads in a stage that's inactive or missing from the funnel", x.length,
    Object.entries(by).map(([k, v]) => `${k}: ${v}`));
});
await check("Leads", "Manual-looking 'website' leads (no visit, no programme) in last 7 days", async () => {
  const x = leads.filter((l) => l.source === "website" && !l.website_session_id && l.created_at >= daysAgo(7));
  report("Leads", "Manual-looking 'website' leads (no visit, no programme) in last 7 days", x.length,
    x.map((l) => l.name), "Add Lead defaults Source to 'website' — counts as website traffic");
});
await check("Leads", "Website leads with no course (go to everyone by turns)", async () => {
  const x = leads.filter((l) => !l.course_id && l.created_at >= daysAgo(7));
  report("Leads", "Website leads with no course (go to everyone by turns)", x.length,
    x.map((l) => `${l.name} [${l.source}]`));
});
await check("Leads", "Cohort intake window closing within 14 days", async () => {
  const soon = new Date(now + 14 * 86400_000).toISOString().slice(0, 10);
  const today = new Date(now + IST).toISOString().slice(0, 10);
  const x = cohorts.filter((c) => c.active && c.intake_end && c.intake_end <= soon);
  report("Leads", "Cohort intake window closing within 14 days", x.length,
    x.map((c) => `${c.name} ends ${c.intake_end}${c.intake_end < today ? " (PASSED)" : ""}`),
    "Create the next cohort in System Config before it closes");
});

// ── Interviews ─────────────────────────────────────────────────────
const bookings = await get("interview_bookings?select=id,lead_id,round,scheduled_at,outcome,interviewer_id,created_at");
await check("Interviews", "Interviews held 2+ days ago with no outcome", async () => {
  const x = bookings.filter((b) => !b.outcome && b.scheduled_at < daysAgo(2));
  const by = {};
  for (const b of x) by[userName.get(b.interviewer_id) || "?"] = (by[userName.get(b.interviewer_id) || "?"] || 0) + 1;
  report("Interviews", "Interviews held 2+ days ago with no outcome", x.length,
    Object.entries(by).map(([k, v]) => `${k}: ${v}`), "Panelists record outcomes on their Interviews page");
});
await check("Interviews", "Interviews booked at odd hours (11 pm – 8 am IST, last 14 days)", async () => {
  const x = bookings.filter((b) => b.created_at >= daysAgo(14) && (istHour(b.scheduled_at) >= 23 || istHour(b.scheduled_at) < 8));
  report("Interviews", "Interviews booked at odd hours (11 pm – 8 am IST, last 14 days)", x.length,
    x.map((b) => `${b.round} ${istDate(b.scheduled_at).toISOString().slice(0, 16).replace("T", " ")}`),
    "Usually a time-zone bug or a typo");
});
await check("Interviews", "Lead in R1/R2/R3 Booked with no booking for that round", async () => {
  const have = new Set(bookings.map((b) => `${b.lead_id}|${b.round}`));
  const x = leads.filter((l) => /^r[123]_booked$/.test(l.stage) && !have.has(`${l.id}|${l.stage.slice(0, 2).toUpperCase()}`));
  report("Interviews", "Lead in R1/R2/R3 Booked with no booking for that round", x.length,
    x.map((l) => `${l.name} (${l.stage})`), "No date / panelist — won't show on any calendar");
});

// ── History & money ────────────────────────────────────────────────
await check("Data", "Duplicate stage-history rows (last 7 days)", async () => {
  const h = await get(`stage_history?select=lead_id,to_stage,changed_at&changed_at=gte.${daysAgo(7)}&order=lead_id,changed_at`);
  let d = 0;
  for (let i = 1; i < h.length; i++) {
    if (h[i].lead_id === h[i - 1].lead_id && h[i].to_stage === h[i - 1].to_stage &&
      Math.abs(new Date(h[i].changed_at) - new Date(h[i - 1].changed_at)) < 5000) d++;
  }
  report("Data", "Duplicate stage-history rows (last 7 days)", d);
});
await check("Data", "Fee remaining doesn't match the payments", async () => {
  // Rule: owed = gross incl. GST − admission fee; admission / application fee
  // lines are not counted against it; deductions on paid lines settle in full.
  const fees = await get("fee_records?select=id,lead_id,total_fee,gross_fee_with_gst,admission_fee,remaining_fee,leads(name)");
  const lines = await get("installments?select=id,fee_record_id,line_type,amount_to_realise,amount_hit_bank,amount_realised,deductions,status,payment_status");
  const by = new Map();
  for (const l of lines) by.set(l.fee_record_id, [...(by.get(l.fee_record_id) || []), l]);
  const bad = [];
  for (const f of fees) {
    const ls = by.get(f.id) || [];
    const owed = Math.max(0, (Number(f.gross_fee_with_gst) || Number(f.total_fee) || 0) - (Number(f.admission_fee) || 0));
    const plan = ls.filter((l) => l.line_type !== "admission_fee" && l.line_type !== "application_fee");
    const settled = plan.reduce((s, l) => {
      const hit = Number(l.amount_hit_bank) || 0;
      const paid = l.status === "paid" || l.payment_status === "Paid";
      return s + (hit || Number(l.amount_realised) || 0) + (paid && hit > 0 ? Number(l.deductions) || 0 : 0);
    }, 0);
    const name = f.leads?.name || f.lead_id;
    if (ls.length && Math.abs(Math.max(0, owed - settled) - Number(f.remaining_fee || 0)) > 1) {
      bad.push(`${name}: stored ₹${Math.round(f.remaining_fee)} vs ₹${Math.round(Math.max(0, owed - settled))}`);
    }
    for (const l of ls) {
      if (l.line_type === "admission_fee" && Number(f.admission_fee) > 0 && Number(l.amount_to_realise) > Number(f.admission_fee) + 1) {
        bad.push(`${name}: "Admission fee" payment of ₹${Math.round(l.amount_to_realise)} is bigger than the admission fee`);
      }
    }
  }
  report("Data", "Fee remaining doesn't match the payments", bad.length, bad,
    "Run supabase/migrations/20261007100000_fee_owed_after_admission.sql");
});
await check("Data", "Loan money disbursed but not counted as received", async () => {
  const loans = await get("loans?select=fee_record_id,amount_realised&amount_realised=gt.0");
  const lines = await get("installments?select=fee_record_id,amount_hit_bank,amount_realised&line_type=eq.loan");
  const inLines = new Map();
  for (const l of lines) inLines.set(l.fee_record_id, (inLines.get(l.fee_record_id) || 0) + (Number(l.amount_hit_bank) || Number(l.amount_realised) || 0));
  const bad = loans.filter((l) => Number(l.amount_realised) - (inLines.get(l.fee_record_id) || 0) > 1);
  report("Data", "Loan money disbursed but not counted as received", bad.length,
    bad.map((l) => `fee ${l.fee_record_id}: ₹${Math.round(l.amount_realised - (inLines.get(l.fee_record_id) || 0))} missing`),
    "Run supabase/migrations/20261007110000_loan_disbursal_received.sql");
});
await check("Data", "Closed–Paid students with no fee record", async () => {
  const fees = new Set((await get("fee_records?select=lead_id")).map((f) => f.lead_id));
  const x = leads.filter((l) => l.stage === "closed_paid" && !fees.has(l.id));
  report("Data", "Closed–Paid students with no fee record", x.length, x.map((l) => l.name),
    "Revenue for these is missing from Payments / P&L");
});

// ── Marketing ──────────────────────────────────────────────────────
await check("Marketing", "Meta spend synced for yesterday", async () => {
  const y = new Date(now + IST - 86400_000).toISOString().slice(0, 10);
  const s = await get(`ad_spend_daily?select=spend&date=eq.${y}`);
  const total = s.reduce((a, r) => a + Number(r.spend || 0), 0);
  report("Marketing", "Meta spend synced for yesterday", total > 0 ? 0 : 1, [`${y}: ₹${Math.round(total)}`]);
});
await check("Marketing", "Ad connections marked connected but token expired", async () => {
  const c = await get("ad_platform_connections?select=platform,account_id,status,token_health");
  const x = c.filter((r) => r.status === "connected" && r.token_health === "expired");
  report("Marketing", "Ad connections marked connected but token expired", x.length,
    x.map((r) => `${r.platform} ${r.account_id}`), "Disconnect the old one in Ad Connections");
});
await check("Marketing", "WhatsApp / email sends that failed or were skipped (last 24h)", async () => {
  const m = await get(`message_logs?select=channel,status,error&created_at=gte.${hoursAgo(24)}`);
  const x = m.filter((r) => r.status !== "sent");
  const by = {};
  for (const r of x) by[`${r.channel}: ${r.error || r.status}`] = (by[`${r.channel}: ${r.error || r.status}`] || 0) + 1;
  report("Marketing", "WhatsApp / email sends that failed or were skipped (last 24h)", x.length,
    Object.entries(by).map(([k, v]) => `${k} ×${v}`), "Provider keys not set in Vercel");
});

// ── Activity sanity (things that look like people not using a feature) ──
await check("Usage", "Counselor calls logged yesterday", async () => {
  const y0 = new Date(Date.UTC(...(() => { const d = new Date(now + IST - 86400_000); return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]; })()) - IST).toISOString();
  const y1 = new Date(new Date(y0).getTime() + 86400_000).toISOString();
  const c = await get(`call_logs?select=counselor_id&logged_at=gte.${y0}&logged_at=lt.${y1}`);
  const by = {};
  for (const r of c) by[userName.get(r.counselor_id) || "?"] = (by[userName.get(r.counselor_id) || "?"] || 0) + 1;
  const missing = counselors.filter((u) => !by[(u.name || "").trim()]).map((u) => `${u.name.trim()}: 0 calls`);
  report("Usage", "Counselor calls logged yesterday", missing.length,
    [...Object.entries(by).map(([k, v]) => `${k}: ${v}`), ...missing], "0 on a working day = check with the counselor");
});
await check("Usage", "Calls with a duration entered (last 7 days)", async () => {
  const c = await get(`call_logs?select=duration,outcome&logged_at=gte.${daysAgo(7)}&outcome=eq.connected`);
  const withDur = c.filter((r) => Number(r.duration) > 0).length;
  report("Usage", "Calls with a duration entered (last 7 days)", withDur === 0 && c.length ? 1 : 0,
    [`${withDur} of ${c.length} connected calls`], "Talk time stays 0 until durations are entered");
});

await check("Marketing", "Paid-ad visits behind leads matched to an organic campaign (last 14 days)", async () => {
  // The tracker re-matches a returning visitor's campaign when they come back via
  // an ad; if that regresses, paid leads show as organic on campaign / ROI pages.
  const PAID = new Set(["paid", "cpc", "ppc", "cpm", "paidsocial"]);
  const camps = new Map((await get("campaigns?select=id,source_type")).map((c) => [c.id, c.source_type]));
  const recent = await get(`leads?select=id,name&created_at=gte.${daysAgo(14)}`);
  const attrs = [];
  for (let i = 0; i < recent.length; i += 150) {
    const chunk = recent.slice(i, i + 150).map((l) => l.id).join(",");
    attrs.push(...(await get(`lead_attribution?select=lead_id,session_id&lead_id=in.(${chunk})`)));
  }
  const sessIds = attrs.map((a) => a.session_id).filter(Boolean);
  const med = new Map();
  for (let i = 0; i < sessIds.length; i += 150) {
    for (const s of await get(`visitor_sessions?select=id,utm_medium,matched_campaign_id&id=in.(${sessIds.slice(i, i + 150).join(",")})`)) {
      med.set(s.id, { medium: (s.utm_medium || "").toLowerCase(), camp: s.matched_campaign_id });
    }
  }
  const name = new Map(recent.map((l) => [l.id, l.name]));
  // A visit tagged paid must be matched to a paid campaign. (A lead whose first
  // visit was genuinely organic and who returned via an ad is fine — the pages
  // count the paid visit.)
  const bad = attrs.filter((a) => {
    const v = med.get(a.session_id);
    return v && PAID.has(v.medium) && camps.get(v.camp) === "organic";
  });
  report("Marketing", "Paid-ad visits behind leads matched to an organic campaign (last 14 days)", bad.length,
    bad.map((a) => name.get(a.lead_id)), "Re-run supabase/migrations/20261006150000_data_fixes_3.sql");
});

// ── Print ──────────────────────────────────────────────────────────
const bad = results.filter((r) => !r.ok);
const stamp = new Date(now + IST).toISOString().slice(0, 16).replace("T", " ");
console.log(`\nHiveSchool CRM health check — ${stamp} IST`);
console.log(`${results.length - bad.length} OK · ${bad.length} need a look\n`);
let area = "";
for (const r of [...bad, ...results.filter((x) => x.ok)]) {
  if (r.area !== area && !r.ok) { area = r.area; }
  console.log(`${r.ok ? "✅" : "⚠️ "} [${r.area}] ${r.name}${r.ok ? "" : ` — ${r.problems}`}`);
  if (!r.ok) {
    for (const e of r.examples) console.log(`      · ${e}`);
    if (r.note) console.log(`      → ${r.note}`);
  }
}
