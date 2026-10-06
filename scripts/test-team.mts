/**
 * Tests de Equipo: RPC list_business_members + helpers + acceso.
 * Uso: npx tsx scripts/test-team.mts
 *
 * - Escenarios multiusuario con memberships temporales en transacciones ROLLBACK.
 * - Nunca imprime emails ni datos personales (solo PASS/FAIL y conteos).
 * - No envía WhatsApp, no crea invitaciones, no activa agentes, no toca citas.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

import {
  BUSINESS_ROLE_LABELS,
  businessRoleLabel,
  canManageTeam,
  formatJoinedDate,
} from "../src/lib/team";

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
    if (!value) continue;
    if (!(key in process.env) || !process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

const PASTORE_ID = "ee05dfbd-839b-4f52-be6f-327080995e56";
const PROTECTED_APPT = "fe422bf9-c6fa-4195-8ef3-749ef228db22";
const ALLOWED_COLUMNS = ["user_id", "name", "email", "role", "joined_at", "is_current_user"];

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`PASS ${name}`);
    passed += 1;
  } else {
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
    failed += 1;
  }
}

// ---------------------------------------------------------------------------
// Unit
// ---------------------------------------------------------------------------
assert("labels: owner → Propietario", businessRoleLabel("owner") === "Propietario");
assert("labels: admin → Administrador", businessRoleLabel("admin") === "Administrador");
assert("labels: member → Miembro", businessRoleLabel("member") === "Miembro");
assert("labels: professional → Profesional", businessRoleLabel("professional") === "Profesional");
assert("labels: solo los 4 roles del MVP", Object.keys(BUSINESS_ROLE_LABELS).join(",") === "owner,admin,professional,member");
assert(
  "canManageTeam: owner/admin sí; professional y member no",
  canManageTeam("owner") && canManageTeam("admin") && !canManageTeam("professional") && !canManageTeam("member"),
);
assert(
  "fecha: 15 sep 2026 en zona del negocio",
  formatJoinedDate("2026-09-15T15:00:00Z", "America/Argentina/Tucuman") === "15 sep 2026",
);
assert(
  "fecha: respeta zona horaria (UTC 02:00 → día anterior en Tucumán)",
  formatJoinedDate("2026-09-16T02:00:00Z", "America/Argentina/Tucuman") === "15 sep 2026",
);
assert("fecha: zona inválida no rompe", formatJoinedDate("2026-09-15T15:00:00Z", "Mars/Base") === "15 sep 2026");

// ---------------------------------------------------------------------------
// Estático: acceso server-side y negocio activo centralizado
// ---------------------------------------------------------------------------
{
  const page = fs.readFileSync(path.join("src", "app", "(dashboard)", "configuracion", "equipo", "page.tsx"), "utf8");
  const svc = fs.readFileSync(path.join("src", "services", "business", "team.service.ts"), "utf8");
  assert("página: redirect server-side si forbidden", /reason === "forbidden"[\s\S]{0,40}redirect\(ROUTES\.configuracion\)/.test(page));
  assert("página: no usa searchParams ni business_id del cliente", !/searchParams|business_id|businessId/.test(page));
  assert("página: sin 'use client'", !/^\s*["']use client["']/m.test(page));
  assert("servicio: usa resolveCurrentWorkspace", svc.includes("businessService.resolveCurrentWorkspace()"));
  assert("servicio: comprueba rol antes de la RPC", svc.indexOf("canManageTeam(") < svc.indexOf("listBusinessMembers("));
  assert(
    "botón Crear usuario habilitado (modal)",
    page.includes("<CreateUserDialog />") && !page.includes("Disponible próximamente"),
  );
  const repo = fs.readFileSync(path.join("src", "repositories", "business.repository.ts"), "utf8");
  const rpcBlock = repo.slice(repo.indexOf("export async function listBusinessMembers"), repo.indexOf("export async function findBusinessById"));
  assert("repositorio: RPC con cliente de sesión (no admin)", rpcBlock.includes("await createClient()") && !rpcBlock.includes("createAdminClient"));
  const all = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      return e.isDirectory() ? all(full) : /\.(ts|tsx)$/.test(e.name) ? [full] : [];
    });
  const invites = all("src").filter((f) => /inviteUserByEmail|business_invitations/.test(fs.readFileSync(f, "utf8")));
  assert("sin invitaciones implementadas", invites.length === 0, invites.join(", "));
}

// ---------------------------------------------------------------------------
// DB
// ---------------------------------------------------------------------------
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});
await client.connect();

async function setUser(userId: string | null) {
  if (userId) {
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    await client.query("set local role authenticated");
  } else {
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: "anon" })]);
    await client.query("set local role anon");
  }
}

async function inTx<T>(fn: () => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    return await fn();
  } finally {
    await client.query("rollback");
  }
}

async function callRpc(businessId: string | null) {
  try {
    const r = await client.query(`select * from public.list_business_members($1)`, [businessId]);
    return { code: null as string | null, rows: r.rows, fields: r.fields.map((f) => f.name) };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "unknown";
    return { code, rows: [] as Record<string, unknown>[], fields: [] as string[] };
  }
}

async function pastoreSnapshot() {
  const r = await client.query(
    `select
       (select count(*)::int from public.business_users where business_id = $1) as members,
       (select string_agg(user_id::text || ':' || role, ',' order by user_id) from public.business_users where business_id = $1) as member_sig,
       (select count(*)::int from public.clinic_services where business_id = $1) as services,
       (select count(*)::int from public.clinic_calendar_resources where business_id = $1) as resources,
       (select count(*)::int from public.clinic_appointments where business_id = $1) as appointments,
       (select max(updated_at)::text from public.clinic_appointments where business_id = $1) as appt_updated,
       (select count(*)::int from public.clinic_appointments where id = $2) as protected_appt,
       (select enabled from public.ai_agent_settings where business_id = $1) as agent_enabled`,
    [PASTORE_ID, PROTECTED_APPT],
  );
  return r.rows[0] as Record<string, unknown>;
}

try {
  const before = await pastoreSnapshot();

  const owner = await client.query<{ user_id: string }>(
    `select user_id from public.business_users where business_id = $1 and role = 'owner' limit 1`,
    [PASTORE_ID],
  );
  const ownerId = owner.rows[0]?.user_id;
  const other = await client.query<{ user_id: string; business_id: string }>(
    `select user_id, business_id from public.business_users
     where business_id <> $1 and role = 'owner' limit 1`,
    [PASTORE_ID],
  );
  const otherUser = other.rows[0]?.user_id;
  const otherBusiness = other.rows[0]?.business_id;
  assert("setup: owner de Pastore y usuario de otro negocio", Boolean(ownerId && otherUser && otherBusiness));

  // Estructura de la función
  const fn = await client.query<{ prosecdef: boolean; proconfig: string[] | null }>(
    `select prosecdef, proconfig from pg_proc where proname = 'list_business_members'`,
  );
  assert("RPC es SECURITY DEFINER", fn.rows[0]?.prosecdef === true);
  assert("RPC con search_path fijo", (fn.rows[0]?.proconfig ?? []).some((c) => c.startsWith("search_path=")));
  const exec = await client.query<{ anon: boolean; auth: boolean; pub: boolean }>(
    `select
       has_function_privilege('anon', 'public.list_business_members(uuid)', 'execute') as anon,
       has_function_privilege('authenticated', 'public.list_business_members(uuid)', 'execute') as auth,
       exists (select 1 from information_schema.routine_privileges
               where routine_name = 'list_business_members' and grantee = 'PUBLIC') as pub`,
  );
  assert("EXECUTE: anon no, PUBLIC no, authenticated sí", !exec.rows[0].anon && !exec.rows[0].pub && exec.rows[0].auth);

  // RLS de business_users sin cambios (solo fila propia)
  const pol = await client.query<{ policyname: string; cmd: string; qual: string }>(
    `select policyname, cmd, qual from pg_policies where schemaname = 'public' and tablename = 'business_users'`,
  );
  const selectPolicies = pol.rows.filter((p) => p.cmd === "SELECT");
  assert(
    "RLS business_users intacta: SELECT solo user_id = auth.uid()",
    selectPolicies.length === 1 && selectPolicies[0].policyname === "business_users_select_own" && /user_id = auth\.uid\(\)/.test(selectPolicies[0].qual),
  );

  // auth.users no expuesto a authenticated/anon
  const authPriv = await client.query<{ a: boolean; b: boolean }>(
    `select has_table_privilege('authenticated', 'auth.users', 'select') as a,
            has_table_privilege('anon', 'auth.users', 'select') as b`,
  );
  assert("auth.users sin SELECT para authenticated/anon", !authPriv.rows[0].a && !authPriv.rows[0].b);

  if (ownerId && otherUser && otherBusiness) {
    // CASO A: owner lista su negocio
    await inTx(async () => {
      await setUser(ownerId);
      const r = await callRpc(PASTORE_ID);
      assert("CASO A: owner de Pastore lista miembros", r.code === null && r.rows.length === Number(before.members));
      assert("CASO A: incluye al usuario actual marcado", r.rows.some((x) => x.user_id === ownerId && x.is_current_user === true));
      assert("CASO A: el owner aparece como owner", r.rows.find((x) => x.user_id === ownerId)?.role === "owner");
      const own = r.rows.find((x) => x.user_id === ownerId);
      assert("CASO A: email presente (no se imprime)", typeof own?.email === "string" && String(own.email).includes("@"));

      // CASO F: solo campos permitidos
      assert("CASO F: columnas exactas permitidas", r.fields.join(",") === ALLOWED_COLUMNS.join(","), r.fields.join(","));
      const forbiddenKeys = ["encrypted_password", "raw_user_meta_data", "raw_app_meta_data", "phone", "confirmation_token", "recovery_token", "last_sign_in_at", "identities", "aud", "instance_id"];
      assert("CASO F: sin campos sensibles de auth.users", r.rows.every((row) => forbiddenKeys.every((k) => !(k in row))));
      assert("CASO F: name es texto o null (no metadata completa)", r.rows.every((row) => row.name === null || typeof row.name === "string"));
    });

    // CASO B: admin lista su negocio (membership temporal)
    await inTx(async () => {
      await client.query(`insert into public.business_users (business_id, user_id, role) values ($1, $2, 'admin')`, [PASTORE_ID, otherUser]);
      await setUser(otherUser);
      const r = await callRpc(PASTORE_ID);
      assert("CASO B: admin lista miembros de Pastore", r.code === null && r.rows.length === Number(before.members) + 1);
      assert("CASO B: solo miembros de Pastore (owner + admin temporal)", r.rows.every((x) => x.user_id === ownerId || x.user_id === otherUser));
      assert("CASO B: orden owner primero", r.rows[0]?.role === "owner");
      assert("CASO B: 'Tú' solo en su fila", r.rows.filter((x) => x.is_current_user).length === 1 && r.rows.find((x) => x.is_current_user)?.user_id === otherUser);
    });

    // CASO C: member no puede
    await inTx(async () => {
      await client.query(`insert into public.business_users (business_id, user_id, role) values ($1, $2, 'member')`, [PASTORE_ID, otherUser]);
      await setUser(otherUser);
      const r = await callRpc(PASTORE_ID);
      assert("CASO C: member de Pastore → denegado (42501)", r.code === "42501" && r.rows.length === 0, `code=${r.code}`);
    });

    // CASO D: owner de A consulta B
    await inTx(async () => {
      await setUser(ownerId);
      const r = await callRpc(otherBusiness);
      assert("CASO D: owner de Pastore consultando otro negocio → denegado", r.code === "42501" && r.rows.length === 0, `code=${r.code}`);
    });
    await inTx(async () => {
      await setUser(ownerId);
      const n = await callRpc(null);
      assert("CASO D: business_id nulo → denegado", n.code === "42501", `code=${n.code}`);
    });
    await inTx(async () => {
      await setUser(ownerId);
      const g = await callRpc("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
      assert("CASO D: business_id inexistente → denegado", g.code === "42501", `code=${g.code}`);
    });

    // CASO D bis: owner de B consulta A
    await inTx(async () => {
      await setUser(otherUser);
      const r = await callRpc(PASTORE_ID);
      assert("CASO D: owner de otro negocio consultando Pastore → denegado", r.code === "42501" && r.rows.length === 0);
    });

    // CASO E: no autenticado
    await inTx(async () => {
      await setUser(null);
      const r = await callRpc(PASTORE_ID);
      assert("CASO E: anon → sin permiso de ejecución", r.code === "42501" && r.rows.length === 0, `code=${r.code}`);
    });
    await inTx(async () => {
      await client.query(`select set_config('request.jwt.claims', '{"role":"authenticated"}', true)`);
      await client.query("set local role authenticated");
      const r = await callRpc(PASTORE_ID);
      assert("CASO E: authenticated sin sub (auth.uid() nulo) → denegado", r.code === "42501" && r.rows.length === 0);
    });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (url && key) {
      const res = await fetch(`${url}/rest/v1/rpc/list_business_members`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_business_id: PASTORE_ID }),
      });
      const body = await res.text();
      assert("CASO E: REST anon /rpc/list_business_members rechazado", !res.ok && !body.includes("@"), `status=${res.status}`);
    }
  }

  // Compatibilidad: membership temporales revertidas, Pastore intacta
  const after = await pastoreSnapshot();
  assert("Pastore: memberships idénticas", after.members === before.members && after.member_sig === before.member_sig);
  assert("Pastore: servicios intactos", after.services === before.services);
  assert("Pastore: profesionales/recursos intactos", after.resources === before.resources);
  assert("Pastore: citas intactas", after.appointments === before.appointments && after.appt_updated === before.appt_updated);
  assert("Pastore: cita protegida sigue existiendo", after.protected_appt === 1);
  assert("Pastore: agente sigue desactivado", after.agent_enabled === false);
} finally {
  await client.end();
}

console.log(`\nRESULT passed=${passed} failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);
