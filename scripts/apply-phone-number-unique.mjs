import fs from "node:fs";
import path from "node:path";
import pg from "pg";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const password = process.env.SUPABASE_DB_PASSWORD;
if (!password) {
  console.error("FAIL=missing password");
  process.exit(1);
}

const sql = fs.readFileSync(
  path.join(
    "supabase",
    "migrations",
    "20260807140000_phone_number_id_unique.sql",
  ),
  "utf8",
);

const client = new pg.Client({
  host: "aws-0-us-east-2.pooler.supabase.com",
  port: 6543,
  user: "postgres.prmanzxthcznfnawhymt",
  password,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(sql);
  const idx = await client.query(`
    select indexname, indexdef
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'business_settings'
      and indexname = 'business_settings_phone_number_id_uidx'
  `);
  console.log("OK_INDEX=" + (idx.rows[0]?.indexdef ?? "missing"));
} catch (error) {
  console.error(
    "FAIL=" + (error instanceof Error ? error.message : String(error)),
  );
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
