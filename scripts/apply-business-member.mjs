/**
 * Aplica supabase/migrations/20261005170000_add_business_member.sql.
 * Uso: node scripts/apply-business-member.mjs --dry-run   (ensayo en transacción + ROLLBACK)
 *      node scripts/apply-business-member.mjs             (aplica en una transacción; aborta si cambian
 *                                                           usuarios, memberships o datos de Pastore)
 * No imprime datos personales: solo conteos y booleanos.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
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
const sqlPath = path.join("supabase", "migrations", "20261005170000_add_business_member.sql");
const sql = fs.readFileSync(sqlPath, "utf8");
const PASTORE_ID = "ee05dfbd-839b-4f52-be6f-327080995e56";
const PROTECTED_APPT = "fe422bf9-c6fa-4195-8ef3-749ef228db22";

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

async function snapshot() {
  return (
    await client.query(
      `select (select count(*)::int from auth.users) users,
              (select md5(string_agg(id::text || coalesce(updated_at::text, '') || coalesce(encrypted_password, ''), ',' order by id)) from auth.users) users_sig,
              (select count(*)::int from public.business_users) mems_count,
              (select md5(string_agg(user_id::text || business_id::text || role, ',' order by user_id, business_id)) from public.business_users) mems,
              (select count(*)::int from public.businesses) businesses,
              (select string_agg(user_id::text, ',') from public.business_users where business_id = $1 and role = 'owner') pastore_owner,
              (select md5(string_agg(user_id::text || role, ',' order by user_id)) from public.business_users where business_id = $1) pastore_mems,
              (select md5(string_agg(to_jsonb(a)::text, ',' order by a.id)) from public.clinic_appointments a where a.business_id = $1) pastore_appts,
              (select count(*)::int from public.clinic_appointments where id = $2) protected_appt,
              (select enabled from public.ai_agent_settings where business_id = $1) agent`,
      [PASTORE_ID, PROTECTED_APPT],
    )
  ).rows[0];
}

async function errCode(text, params = []) {
  await client.query("savepoint e");
  try {
    await client.query(text, params);
    await client.query("rollback to savepoint e");
    return null;
  } catch (e) {
    await client.query("rollback to savepoint e");
    return e?.code ?? "?";
  }
}

await client.connect();
try {
  await client.query("begin");
  const before = await snapshot();

  await client.query(sql);

  const fn = (
    await client.query(
      `select to_regprocedure('public.add_business_member(uuid,uuid,text)') is not null exists_,
              has_function_privilege('anon', 'public.add_business_member(uuid,uuid,text)', 'execute') anon,
              has_function_privilege('authenticated', 'public.add_business_member(uuid,uuid,text)', 'execute') auth,
              (select prosecdef from pg_proc where proname = 'add_business_member' and pronamespace = 'public'::regnamespace) definer`,
    )
  ).rows[0];

  // Llamadas sin sesión y de un usuario sin membership: deben fallar con 42501 (revertidas).
  await client.query("set local role authenticated");
  await client.query(`select set_config('request.jwt.claims', '', true)`);
  const unauth = await errCode(`select public.add_business_member($1, $2, 'admin')`, [PASTORE_ID, randomUUID()]);
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: randomUUID(), role: "authenticated" })]);
  const outsider = await errCode(`select public.add_business_member($1, $2, 'admin')`, [PASTORE_ID, randomUUID()]);
  await client.query("reset role");

  const after = await snapshot();
  const unchanged = JSON.stringify(before) === JSON.stringify(after);

  console.log(`add_business_member existe: ${fn.exists_}`);
  console.log(`SECURITY DEFINER: ${fn.definer}`);
  console.log(`anon EXECUTE: ${fn.anon}`);
  console.log(`authenticated EXECUTE: ${fn.auth}`);
  console.log(`sin sesión rechazado (42501): ${unauth === "42501"}`);
  console.log(`usuario sin membership rechazado (42501): ${outsider === "42501"}`);
  console.log(`usuarios: ${after.users}, memberships: ${after.mems_count}, negocios: ${after.businesses}`);
  console.log(`usuarios/contraseñas/memberships/negocios sin cambios: ${unchanged}`);
  console.log(`Pastore owner presente: ${Boolean(after.pastore_owner)}, cita protegida: ${after.protected_appt === 1}, agente enabled: ${after.agent}`);

  if (!fn.exists_ || fn.anon || !fn.auth || !fn.definer || unauth !== "42501" || outsider !== "42501" || !unchanged || after.protected_appt !== 1 || after.agent !== false) {
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
}

if (!dryRun && process.exitCode !== 1) {
  const post = (
    await client.query(
      `select to_regprocedure('public.add_business_member(uuid,uuid,text)') is not null exists_,
              has_function_privilege('anon', 'public.add_business_member(uuid,uuid,text)', 'execute') anon`,
    )
  ).rows[0];
  console.log(`post-commit: existe=${post.exists_} anon=${post.anon}`);
}
await client.end();
