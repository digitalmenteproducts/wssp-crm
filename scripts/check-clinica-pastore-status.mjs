import fs from "node:fs";
import pg from "pg";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const s = line.trim();
  if (!s || s.startsWith("#")) continue;
  const i = s.indexOf("=");
  if (i <= 0) continue;
  const k = s.slice(0, i).trim();
  let v = s.slice(i + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  if (!(k in process.env)) process.env[k] = v;
}

const id = "ee05dfbd-839b-4f52-be6f-327080995e56";
const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const a = await c.query(
  "select enabled from ai_agent_settings where business_id = $1",
  [id],
);
const w = await c.query(
  "select whatsapp_connection_status, whatsapp_phone_number_id is null as no_phone from business_settings where business_id = $1",
  [id],
);
console.log(JSON.stringify({ agent: a.rows[0], wa: w.rows[0] }));
await c.end();
