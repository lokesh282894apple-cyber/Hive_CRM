import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const counselorEmail = process.env.SEED_COUNSELOR_EMAIL || process.env.SEED_COUNSELLOR_EMAIL || "counsellor@hiveschool.in";
const counselorPassword = process.env.SEED_COUNSELOR_PASSWORD || process.env.SEED_COUNSELLOR_PASSWORD || "Counsellor2026!";
const interviewerEmail = process.env.SEED_INTERVIEWER_EMAIL || "interviewer@hiveschool.in";
const interviewerPassword = process.env.SEED_INTERVIEWER_PASSWORD || "Interviewer2026!";

if (!url || !serviceKey) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function upsertAuthUser(email, password) {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
  const existing = list?.users?.find((u) => u.email === email);
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user.id;
}

async function main() {
  // Courses
  const courseNames = [
    "PGP in Revenue, AI & Entrepreneurship",
    "AI Marketing & Entrepreneurship Fellowship",
    "Undergraduate Programme",
    "Executive Revenue Sprint",
  ];

  const courseIds = [];
  for (const name of courseNames) {
    const { data: existing } = await admin.from("courses").select("id").eq("name", name).maybeSingle();
    if (existing) {
      courseIds.push(existing.id);
      continue;
    }
    const { data, error } = await admin.from("courses").insert({ name, active: true }).select("id").single();
    if (error) throw error;
    courseIds.push(data.id);
  }

  const cohorts = [];
  for (let i = 0; i < courseIds.length; i++) {
    const name = `Cohort ${new Date().getFullYear()} · ${["A", "B", "C", "D"][i]}`;
    const { data: existing } = await admin
      .from("cohorts")
      .select("id")
      .eq("course_id", courseIds[i])
      .eq("name", name)
      .maybeSingle();
    if (existing) {
      cohorts.push({ id: existing.id, course_id: courseIds[i] });
      continue;
    }
    const { data, error } = await admin
      .from("cohorts")
      .insert({
        course_id: courseIds[i],
        name,
        start_date: "2026-09-01",
        default_total_fee: 350000 + i * 25000,
        active: true,
      })
      .select("id, course_id")
      .single();
    if (error) throw error;
    cohorts.push(data);
  }

  // Vendors
  for (const name of ["Propelld", "Eduvanz", "Liquid"]) {
    const { data: existing } = await admin.from("loan_vendors").select("id").eq("name", name).maybeSingle();
    if (!existing) {
      await admin.from("loan_vendors").insert({ name, active: true });
    }
  }

  const counselorId = await upsertAuthUser(counselorEmail, counselorPassword);
  await admin.from("users").upsert({
    id: counselorId,
    name: "Demo Counselor",
    email: counselorEmail,
    role: "counselor",
    active: true,
  });

  const interviewerId = await upsertAuthUser(interviewerEmail, interviewerPassword);
  await admin.from("users").upsert({
    id: interviewerId,
    name: "Demo Interviewer",
    email: interviewerEmail,
    role: "interviewer",
    active: true,
  });

  await admin.from("counselor_scope").delete().eq("user_id", counselorId);
  await admin.from("counselor_scope").insert(
    cohorts.map((c) => ({
      user_id: counselorId,
      course_id: c.course_id,
      cohort_id: c.id,
    }))
  );

  // Availability for next 5 weekdays
  const today = new Date();
  for (let d = 1; d <= 7; d++) {
    const date = new Date(today);
    date.setDate(today.getDate() + d);
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    const dateStr = date.toISOString().slice(0, 10);
    await admin.from("interviewer_availability").insert([
      {
        interviewer_id: interviewerId,
        date: dateStr,
        start_time: "10:00",
        end_time: "11:00",
        status: "free",
      },
      {
        interviewer_id: interviewerId,
        date: dateStr,
        start_time: "15:00",
        end_time: "16:00",
        status: "free",
      },
    ]);
  }

  // Sample leads
  const stages = ["new_lead", "in_funnel", "dnp", "no_show", "reschedule", "r1_booked", "lead_created"];
  const { count } = await admin.from("leads").select("*", { count: "exact", head: true });
  if ((count ?? 0) < 10) {
    const rows = stages.map((stage, i) => ({
      name: `Sample Lead ${i + 1}`,
      email: `lead${i + 1}@example.com`,
      phone: `98765000${String(i).padStart(2, "0")}`,
      course_id: cohorts[i % cohorts.length].course_id,
      cohort_id: cohorts[i % cohorts.length].id,
      source: "website",
      years_experience: 1 + (i % 5),
      preferred_industry: ["D2C", "SaaS", "FMCG", "Fintech"][i % 4],
      intent_score: 40 + i * 5,
      lead_allocated_to: counselorId,
      stage,
    }));
    const { error } = await admin.from("leads").insert(rows);
    if (error) console.warn("Lead insert:", error.message);
  }

  console.log("Mock data seeded.");
  console.log(`Counselor: ${counselorEmail}`);
  console.log(`Interviewer: ${interviewerEmail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
