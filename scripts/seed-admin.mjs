import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.SEED_ADMIN_EMAIL || "nikhil@hiveschool.in";
const password = process.env.SEED_ADMIN_PASSWORD || "HiveAdmin2026!";

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
  const id = await upsertAuthUser(email, password);
  const { error } = await admin.from("users").upsert({
    id,
    name: "Nikhil Admin",
    email,
    role: "admin",
    active: true,
  });
  if (error) throw error;
  console.log(`Admin ready: ${email} / (SEED_ADMIN_PASSWORD) id=${id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
