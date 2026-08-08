/**
 * Apply a SQL migration file via DATABASE_URL (pg).
 *
 * Usage:
 *   npm run db:migrate
 *     → applies 20260731000000_admissions_schema.sql only if users table missing
 *   npm run db:migrate -- supabase/migrations/20260808120000_marketing_funnel_schema.sql
 *     → applies the given migration file
 *
 * Prefer: paste SQL in Supabase Dashboard SQL Editor when DATABASE_URL is unset.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const argPath = process.argv[2];
const defaultAdmissions = "supabase/migrations/20260731000000_admissions_schema.sql";
const sqlPath = resolve(root, argPath || defaultAdmissions);

if (!existsSync(sqlPath)) {
  console.error(`Migration file not found: ${sqlPath}`);
  process.exit(1);
}

const sql = readFileSync(sqlPath, "utf8");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
const isAdmissionsBootstrap = !argPath;

async function schemaExists() {
  if (!url || !serviceKey) return false;
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await admin.from("users").select("id").limit(1);
  return !error;
}

async function main() {
  if (isAdmissionsBootstrap && (await schemaExists())) {
    console.log("Schema already present (users table readable). Skipping admissions bootstrap.");
    console.log(
      "To apply marketing (or another) migration:\n  npm run db:migrate -- supabase/migrations/20260808120000_marketing_funnel_schema.sql"
    );
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

Optional: add to .env.local
  DATABASE_URL=postgresql://postgres.[ref]:[PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
and re-run with the migration path.
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
    console.log(`Migration applied successfully: ${sqlPath}`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
