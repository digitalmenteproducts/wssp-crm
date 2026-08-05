import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const password = process.env.SUPABASE_DB_PASSWORD;
if (!password) {
  console.error("FAIL=missing password");
  process.exit(1);
}

const sql = fs.readFileSync(
  path.join(
    "supabase",
    "migrations",
    "20260805120000_sprint3_ai_segments.sql",
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
  const tables = await client.query(`
    select table_name from information_schema.tables
    where table_schema='public' and table_name in ('ai_analysis','segments')
    order by 1
  `);
  const segs = await client.query(`select count(*)::int as n from segments`);
  console.log(
    "OK_TABLES=" + tables.rows.map((r) => r.table_name).join(","),
  );
  console.log("OK_SEGMENTS=" + segs.rows[0].n);
} catch (error) {
  console.error(
    "FAIL=" + (error instanceof Error ? error.message : String(error)),
  );
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
