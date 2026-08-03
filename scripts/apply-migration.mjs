/**
 * Apply admissions schema migration.
 *
 * Prefer: paste SQL in Supabase Dashboard SQL Editor.
 * Or set DATABASE_URL and re-run this script (requires `pg`).
 *
 * Dashboard:
 *   https://supabase.com/dashboard/project/myxdfsramkqxkiuzqbxk/sql/new
 * File:
 *   supabase/migrations/20260731000000_admissions_schema.sql
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const sqlPath = resolve(root, "supabase/migrations/20260731000000_admissions_schema.sql");
const sql = readFileSync(sqlPath, "utf8");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

async function schemaExists() {
  if (!url || !serviceKey) return false;
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await admin.from("users").select("id").limit(1);
  return !error;
}

async function main() {
  if (await schemaExists()) {
    console.log("Schema already present (users table readable). Skipping.");
    return;
  }

  if (!databaseUrl) {
    console.log(`
No DATABASE_URL set — cannot apply DDL via API.

Apply manually:
1. Open https://supabase.com/dashboard/project/myxdfsramkqxkiuzqbxk/sql/new
2. Paste contents of:
   ${sqlPath}
3. Click Run
4. Then: npm run seed:admin && npm run seed:mock

Optional: add to .env.local
  DATABASE_URL=postgresql://postgres.[ref]:[PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
and re-run npm run db:migrate
`);
    process.exit(0);
  }

  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
    console.log("Migration applied successfully.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
