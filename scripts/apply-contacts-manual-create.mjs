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
const sql = fs.readFileSync(
  path.join(
    "supabase",
    "migrations",
    "20260924140000_contacts_manual_create.sql",
  ),
  "utf8",
);

const candidates = [
  {
    label: "DATABASE_URL",
    config: {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 20000,
    },
  },
  {
    label: "pooler-session-5432",
    config: {
      host: "aws-0-us-east-2.pooler.supabase.com",
      port: 5432,
      user: "postgres.prmanzxthcznfnawhymt",
      password,
      database: "postgres",
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 20000,
    },
  },
];

let applied = false;

for (const candidate of candidates) {
  if (candidate.label === "DATABASE_URL" && !process.env.DATABASE_URL) continue;
  if (candidate.label !== "DATABASE_URL" && !password) continue;

  const client = new pg.Client(candidate.config);
  try {
    await client.connect();
    console.log(`CONNECTED=${candidate.label}`);
    await client.query(sql);

    const emailCol = await client.query(`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'contacts' and column_name = 'email'
    `);
    const policy = await client.query(`
      select polname from pg_policy
      where polrelid = 'public.contacts'::regclass and polname = 'contacts_insert_member'
    `);

    console.log("OK=contacts_manual_create");
    console.log("EMAIL_COL=", emailCol.rows.length > 0);
    console.log("INSERT_POLICY=", policy.rows.length > 0);
    await client.end();
    applied = true;
    break;
  } catch (err) {
    console.log(`FAIL=${candidate.label}: ${err instanceof Error ? err.message : err}`);
    try {
      await client.end();
    } catch {
      /* ignore */
    }
  }
}

if (!applied) {
  console.error("FAIL=could not apply migration");
  process.exit(1);
}
