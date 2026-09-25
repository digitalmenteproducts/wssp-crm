import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const password = process.env.SUPABASE_DB_PASSWORD;
if (!password) {
  console.error("FAIL=missing SUPABASE_DB_PASSWORD");
  process.exit(1);
}

const sqlPath = path.join(
  "supabase",
  "migrations",
  "20260804120000_sprint1_businesses.sql",
);
const sql = fs.readFileSync(sqlPath, "utf8");

const candidates = [
  {
    label: "pooler-us-east-2-6543",
    host: "aws-0-us-east-2.pooler.supabase.com",
    port: 6543,
    user: "postgres.prmanzxthcznfnawhymt",
  },
  {
    label: "pooler-us-east-1-6543",
    host: "aws-0-us-east-1.pooler.supabase.com",
    port: 6543,
    user: "postgres.prmanzxthcznfnawhymt",
  },
  {
    label: "pooler-us-west-1-6543",
    host: "aws-0-us-west-1.pooler.supabase.com",
    port: 6543,
    user: "postgres.prmanzxthcznfnawhymt",
  },
  {
    label: "pooler-sa-east-1-6543",
    host: "aws-0-sa-east-1.pooler.supabase.com",
    port: 6543,
    user: "postgres.prmanzxthcznfnawhymt",
  },
  {
    label: "pooler-us-east-2-5432",
    host: "aws-0-us-east-2.pooler.supabase.com",
    port: 5432,
    user: "postgres.prmanzxthcznfnawhymt",
  },
  {
    label: "db-ipv6",
    host: "2600:1f16:111a:af02:4e0e:8240:8a8d:bfec",
    port: 5432,
    user: "postgres",
  },
];

async function runWith(config) {
  const client = new pg.Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });

  await client.connect();
  try {
    await client.query(sql);

    const tables = await client.query(`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('businesses', 'business_users', 'business_settings')
      order by table_name
    `);

    const fn = await client.query(`
      select proname
      from pg_proc
      where proname = 'create_business_for_current_user'
    `);

    return {
      tables: tables.rows.map((row) => row.table_name),
      fn: fn.rowCount > 0,
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

let lastError = "unknown";

for (const candidate of candidates) {
  try {
    console.log("TRY=" + candidate.label);
    const result = await runWith(candidate);
    console.log("OK_VIA=" + candidate.label);
    console.log("OK_TABLES=" + result.tables.join(","));
    console.log("OK_FN=" + (result.fn ? "yes" : "no"));
    process.exit(0);
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    console.log("FAIL_VIA=" + candidate.label + " :: " + lastError);
  }
}

console.error("FAIL=" + lastError);
process.exit(1);
