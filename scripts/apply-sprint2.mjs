import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const password = process.env.SUPABASE_DB_PASSWORD;
if (!password) {
  console.error("FAIL=missing password");
  process.exit(1);
}

const sql = fs.readFileSync(
  path.join("supabase", "migrations", "20260804200000_sprint2_whatsapp_inbox.sql"),
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
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ('contacts', 'conversations', 'messages')
    order by table_name
  `);

  console.log(
    "OK_TABLES=" + tables.rows.map((row) => row.table_name).join(","),
  );
} catch (error) {
  console.error(
    "FAIL=" + (error instanceof Error ? error.message : String(error)),
  );
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
