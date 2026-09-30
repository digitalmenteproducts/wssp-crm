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
    if (!(key in process.env) || !process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

const sqlPath = path.join(
  "supabase",
  "migrations",
  "20260930120000_business_secrets.sql",
);
const sql = fs.readFileSync(sqlPath, "utf8");

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

await client.connect();
try {
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");

  // Solo conteos; nunca valores.
  const counts = await client.query(`
    select
      (select count(*)::int from public.business_secrets) as secrets_rows,
      (select count(*)::int from public.business_settings bs
        left join public.business_secrets s on s.business_id = bs.business_id
        where (bs.openai_api_key is not null and s.openai_api_key is distinct from bs.openai_api_key)
           or (bs.whatsapp_access_token is not null and s.whatsapp_access_token is distinct from bs.whatsapp_access_token)
           or (bs.whatsapp_verify_token is not null and s.whatsapp_verify_token is distinct from bs.whatsapp_verify_token)
      ) as mismatched
  `);
  console.log("OK applied", sqlPath);
  console.log("SECRETS_ROWS=" + counts.rows[0].secrets_rows);
  console.log("MISMATCHED=" + counts.rows[0].mismatched);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
