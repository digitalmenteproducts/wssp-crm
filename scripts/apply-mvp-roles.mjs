/**
 * Aplica supabase/migrations/20261005120000_mvp_roles_professional.sql.
 * Uso: node scripts/apply-mvp-roles.mjs --dry-run   (ensayo en transacción + ROLLBACK)
 *      node scripts/apply-mvp-roles.mjs             (aplica en una transacción; aborta si cambia
 *                                                     lo que ve cualquier membership real)
 * No imprime datos personales: solo conteos.
 */
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

const dryRun = process.argv.includes("--dry-run");
const sqlPath = path.join("supabase", "migrations", "20261005120000_mvp_roles_professional.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

const TABLES = [
  "businesses",
  "business_settings",
  "contacts",
  "conversations",
  "messages",
  "clinic_appointments",
  "clinic_calendar_resources",
  "clinic_services",
  "ai_agent_settings",
  "ai_knowledge_entries",
  "campaigns",
  "templates",
  "segments",
];

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

/** Lo que ve cada membership real por RLS, tabla a tabla. */
async function visibility(memberships) {
  const out = {};
  for (const m of memberships) {
    await client.query("savepoint vis");
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: m.user_id, role: "authenticated" }),
    ]);
    await client.query("set local role authenticated");
    const counts = [];
    for (const t of TABLES) {
      const r = await client.query(`select count(*)::int n from public.${t}`);
      counts.push(r.rows[0].n);
    }
    await client.query("rollback to savepoint vis");
    await client.query("reset role");
    out[`${m.user_id}:${m.business_id}`] = counts.join(",");
  }
  return out;
}

await client.connect();
try {
  await client.query("begin");
  const memberships = (await client.query(`select user_id, business_id, role from public.business_users order by created_at`)).rows;
  const rolesBefore = memberships.map((m) => `${m.user_id}:${m.business_id}:${m.role}`).join("|");
  const before = await visibility(memberships);

  await client.query(sql);

  const after = await visibility(memberships);
  const rolesAfter = (await client.query(`select user_id, business_id, role from public.business_users order by created_at`)).rows
    .map((m) => `${m.user_id}:${m.business_id}:${m.role}`)
    .join("|");
  const check = (await client.query(`select pg_get_constraintdef(oid) def from pg_constraint where conname = 'business_users_role_check'`)).rows[0]?.def ?? "";

  const sameVisibility = Object.keys(before).every((k) => before[k] === after[k]);
  const checkOk = /professional/.test(check) && !/staff/.test(check);

  // professional temporal (savepoint revertido incluso al aplicar): workspace sí, datos operativos no.
  const a = memberships[0];
  const b = memberships.find(
    (m) => a && !memberships.some((x) => x.user_id === m.user_id && x.business_id === a.business_id),
  );
  let professionalOk = false;
  if (a && b) {
    await client.query("savepoint prof");
    await client.query(`insert into public.business_users (business_id, user_id, role) values ($1, $2, 'professional')`, [a.business_id, b.user_id]);
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: b.user_id, role: "authenticated" })]);
    await client.query("set local role authenticated");
    const own = (await client.query(`select count(*)::int n from public.business_users where business_id = $1`, [a.business_id])).rows[0].n;
    const ws = (await client.query(`select (select count(*)::int from public.businesses where id = $1) + (select count(*)::int from public.business_settings where business_id = $1) n`, [a.business_id])).rows[0].n;
    let leaked = 0;
    for (const t of TABLES.filter((x) => x !== "businesses" && x !== "business_settings")) {
      leaked += (await client.query(`select count(*)::int n from public.${t} where business_id = $1`, [a.business_id])).rows[0].n;
    }
    await client.query("rollback to savepoint prof");
    await client.query("reset role");
    professionalOk = own === 1 && ws === 2 && leaked === 0;
  }

  console.log(`memberships reales: ${memberships.length} (${[...new Set(memberships.map((m) => m.role))].join(",")})`);
  console.log(`roles sin cambios: ${rolesBefore === rolesAfter}`);
  console.log(`visibilidad RLS idéntica para memberships reales: ${sameVisibility}`);
  console.log(`check final (sin staff): ${check}`);
  console.log(`professional: membership + workspace visibles, 0 filas operativas: ${professionalOk}`);

  if (!sameVisibility || rolesBefore !== rolesAfter || !checkOk || !professionalOk) {
    throw new Error("Abortado: la migración no cumple las condiciones de seguridad/compatibilidad.");
  }

  if (dryRun) {
    await client.query("rollback");
    console.log("DRY RUN: rollback, nada aplicado.");
  } else {
    await client.query("commit");
    console.log("OK applied", sqlPath);
  }
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.end();
}
