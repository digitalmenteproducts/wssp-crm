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
  path.join("supabase", "migrations", "20260924120000_clinic_agenda_vertical.sql"),
  "utf8",
);

const PASTORE_ID = "ee05dfbd-839b-4f52-be6f-327080995e56";

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
    console.log(`CONNECTED=${candidate.label}`);
    await client.query(sql);

    const tables = await client.query(`
      select table_name from information_schema.tables
      where table_schema = 'public'
        and table_name in (
          'clinic_calendar_resources',
          'clinic_availability',
          'clinic_schedule_blocks',
          'clinic_appointments'
        )
      order by 1
    `);

    const industryCol = await client.query(`
      select column_name, data_type
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'businesses'
        and column_name = 'industry'
    `);

    const pastore = await client.query(
      `
      select id, name, slug, industry, timezone
      from public.businesses
      where id = $1
    `,
      [PASTORE_ID],
    );

    const agent = await client.query(
      `
      select business_id, enabled
      from public.ai_agent_settings
      where business_id = $1
    `,
      [PASTORE_ID],
    );

    const constraint = await client.query(`
      select conname from pg_constraint
      where conname = 'clinic_appointments_no_overlap'
    `);

    console.log("OK=clinic_agenda_vertical");
    console.log("TABLES=", tables.rows.map((r) => r.table_name).join(","));
    console.log("INDUSTRY_COL=", JSON.stringify(industryCol.rows));
    console.log("PASTORE=", JSON.stringify(pastore.rows[0] ?? null));
    console.log("AGENT=", JSON.stringify(agent.rows[0] ?? null));
    console.log("NO_OVERLAP=", constraint.rows.length > 0);

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
