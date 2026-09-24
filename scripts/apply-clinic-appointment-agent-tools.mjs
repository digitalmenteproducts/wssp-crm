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

const sql = fs.readFileSync(
  path.join(
    "supabase",
    "migrations",
    "20260924160000_clinic_appointment_agent_tools.sql",
  ),
  "utf8",
);

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

await client.connect();
await client.query(sql);

const flag = await client.query(`
  select column_name from information_schema.columns
  where table_schema='public' and table_name='ai_agent_settings'
    and column_name='clinic_appointment_tools_enabled'
`);
const meta = await client.query(`
  select column_name from information_schema.columns
  where table_schema='public' and table_name='conversations'
    and column_name='agent_metadata'
`);
const pastore = await client.query(`
  select enabled, clinic_appointment_tools_enabled
  from public.ai_agent_settings
  where business_id = 'ee05dfbd-839b-4f52-be6f-327080995e56'
`);

console.log("OK=clinic_appointment_agent_tools");
console.log("FLAG_COL=", flag.rows.length === 1);
console.log("META_COL=", meta.rows.length === 1);
console.log("PASTORE=", JSON.stringify(pastore.rows[0] ?? null));
await client.end();
