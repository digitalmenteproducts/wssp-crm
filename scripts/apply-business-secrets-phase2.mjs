/**
 * Fase 2: retira openai_api_key, whatsapp_access_token y whatsapp_verify_token
 * de business_settings. Ejecutar SOLO con el código que usa business_secrets
 * ya desplegado en producción:
 *   node scripts/apply-business-secrets-phase2.mjs --confirm-deployed
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

if (!process.argv.includes("--confirm-deployed")) {
  console.error(
    "ABORT: pasa --confirm-deployed cuando el código nuevo esté en producción.",
  );
  process.exit(1);
}

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
  "pending-migrations",
  "20260930130000_business_settings_drop_legacy_secrets.sql",
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
  console.log("OK applied", sqlPath);
  console.log(
    "Mueve el archivo a supabase/migrations para mantener el historial.",
  );
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
