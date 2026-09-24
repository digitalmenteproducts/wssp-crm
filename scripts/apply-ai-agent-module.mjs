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
  path.join("supabase", "migrations", "20260904120000_ai_agent_module.sql"),
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
  {
    label: "pooler-tx-6543",
    config: {
      host: "aws-0-us-east-2.pooler.supabase.com",
      port: 6543,
      user: "postgres.prmanzxthcznfnawhymt",
      password,
      database: "postgres",
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 20000,
    },
  },
  {
    label: "direct-db",
    config: {
      host: "db.prmanzxthcznfnawhymt.supabase.co",
      port: 5432,
      user: "postgres",
      password,
      database: "postgres",
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 20000,
    },
  },
];

let applied = false;

for (const candidate of candidates) {
  if (candidate.label === "DATABASE_URL" && !process.env.DATABASE_URL) {
    console.log("SKIP=DATABASE_URL missing");
    continue;
  }
  if (candidate.label !== "DATABASE_URL" && !password) {
    console.log("SKIP=password missing");
    continue;
  }

  const client = new pg.Client(candidate.config);
  try {
    await client.connect();
    await client.query(sql);
    const tables = await client.query(`
      select table_name from information_schema.tables
      where table_schema = 'public'
        and table_name in ('ai_agent_settings', 'ai_knowledge_entries', 'ai_usage')
      order by 1
    `);
    const cols = await client.query(`
      select column_name from information_schema.columns
      where table_schema = 'public'
        and table_name = 'conversations'
        and column_name in ('agent_paused', 'human_handoff_at', 'agent_failed_attempts')
      order by 1
    `);
    console.log(`OK_VIA=${candidate.label}`);
    console.log(
      `OK_TABLES=${tables.rows.map((row) => row.table_name).join(",")}`,
    );
    console.log(
      `OK_CONV_COLS=${cols.rows.map((row) => row.column_name).join(",")}`,
    );
    applied = true;
    await client.end().catch(() => undefined);
    break;
  } catch (error) {
    console.log(
      `FAIL_VIA=${candidate.label} :: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    await client.end().catch(() => undefined);
  }
}

if (!applied) {
  process.exitCode = 1;
}
