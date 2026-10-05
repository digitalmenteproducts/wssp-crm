/**
 * Tests de roles MVP (owner/admin/professional; member legacy).
 * Uso: npx tsx scripts/test-roles.mts
 *      BASE_URL=http://localhost:3000 npx tsx scripts/test-roles.mts  (añade redirecciones sin sesión)
 *
 * - La migración 20261005120000 se ejecuta DENTRO de cada transacción y se revierte (ROLLBACK):
 *   funciona tanto si ya está aplicada como si no. No crea usuarios ni cambia roles reales.
 * - Nunca imprime emails ni datos personales (solo PASS/FAIL y conteos).
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

import { selectActiveMembership } from "../src/lib/active-business";
import {
  APP_MODULES,
  accessDeniedRoute,
  canAccessModule,
  canManageBusiness,
  moduleForPath,
  type AppModule,
} from "../src/lib/permissions";
import { BUSINESS_ROLE_LABELS, businessRoleLabel, canManageTeam } from "../src/lib/team";
import { BUSINESS_ROLES, type BusinessRole, type BusinessUser } from "../src/types/business";

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
const MIGRATION = fs.readFileSync(
  path.join("supabase", "migrations", "20261005120000_mvp_roles_professional.sql"),
  "utf8",
);

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
// Matriz de acceso
// ---------------------------------------------------------------------------
const allowed = (role: BusinessRole) => APP_MODULES.filter((m) => canAccessModule(role, m));

assert("roles técnicos: owner, admin, professional, member", BUSINESS_ROLES.join(",") === "owner,admin,professional,member");
assert("staff no es un rol", !(BUSINESS_ROLES as readonly string[]).includes("staff") && APP_MODULES.every((m) => !canAccessModule("staff", m)));
assert("OWNER: acceso completo", allowed("owner").length === APP_MODULES.length);
assert("ADMIN: acceso completo (incluye Equipo)", allowed("admin").length === APP_MODULES.length && canAccessModule("admin", "team"));

for (const appModule of APP_MODULES) {
  const expected = appModule === "dashboard";
  assert(`PROFESSIONAL: ${appModule} ${expected ? "sí" : "no"}`, canAccessModule("professional", appModule) === expected);
}
assert("MEMBER legacy: conserva todo salvo Equipo (comportamiento previo)", allowed("member").length === APP_MODULES.length - 1 && !canAccessModule("member", "team"));
assert("rol desconocido → sin acceso", APP_MODULES.every((m) => !canAccessModule("superadmin", m) && !canAccessModule("", m)));
assert(
  "canManageBusiness: solo owner/admin",
  canManageBusiness("owner") && canManageBusiness("admin") && !["staff", "professional", "member", "x"].some(canManageBusiness),
);
assert(
  "Equipo: solo owner/admin",
  canManageTeam("owner") && canManageTeam("admin") && !canManageTeam("professional") && !canManageTeam("member") && !canManageTeam("staff"),
);

// Etiquetas
assert(
  "etiquetas de rol (sin Recepción)",
  businessRoleLabel("owner") === "Propietario" &&
    businessRoleLabel("admin") === "Administrador" &&
    businessRoleLabel("professional") === "Profesional" &&
    businessRoleLabel("member") === "Miembro" &&
    Object.keys(BUSINESS_ROLE_LABELS).join(",") === "owner,admin,professional,member" &&
    !Object.values(BUSINESS_ROLE_LABELS).includes("Recepción"),
);

// Rutas → módulo
const routeCases: Array<[string, AppModule | null]> = [
  ["/panel", "dashboard"],
  ["/contactos", "contacts"],
  ["/conversaciones", "conversations"],
  ["/agenda", "agenda"],
  ["/servicios", "services"],
  ["/segmentos", "campaigns"],
  ["/plantillas", "campaigns"],
  ["/campanas", "campaigns"],
  ["/campanas/nueva", "campaigns"],
  ["/agente-ia", "ai_agent"],
  ["/configuracion", "settings"],
  ["/configuracion/equipo", "team"],
  ["/agente", null],
];
assert(
  "moduleForPath: rutas del dashboard (Equipo más específico que Configuración)",
  routeCases.every(([p, m]) => moduleForPath(p) === m),
  routeCases.filter(([p, m]) => moduleForPath(p) !== m).map(([p]) => p).join(","),
);
assert("acceso denegado → Panel con aviso", accessDeniedRoute() === "/panel?acceso=denegado");
assert(
  "PROFESSIONAL por URL: todo denegado salvo Panel",
  routeCases.filter(([, m]) => m && m !== "dashboard").every(([p]) => !canAccessModule("professional", moduleForPath(p)!)) &&
    canAccessModule("professional", moduleForPath("/panel")!),
);

// Negocio activo: prioridad de roles en fallback
const mk = (business_id: string, role: BusinessRole): BusinessUser => ({
  id: business_id,
  business_id,
  user_id: "u",
  role,
  created_at: "2026-01-01T00:00:00Z",
});
const sel = selectActiveMembership([mk("b-prof", "professional"), mk("b-member", "member"), mk("b-owner", "owner")], null);
assert("fallback multi-negocio: owner > member > professional", sel?.membership.business_id === "b-owner");
const sel2 = selectActiveMembership([mk("b-prof", "professional"), mk("b-member", "member")], null);
assert("fallback multi-negocio: member > professional", sel2?.membership.business_id === "b-member");
const sel3 = selectActiveMembership([mk("b-prof", "professional")], null);
assert("PROFESSIONAL: membership válida resuelve su workspace", sel3?.membership.business_id === "b-prof" && sel3.membership.role === "professional");
const PROF_BIZ = "00000000-0000-4000-8000-000000000002";
const sel4 = selectActiveMembership([mk("00000000-0000-4000-8000-000000000001", "owner"), mk(PROF_BIZ, "professional")], PROF_BIZ);
assert("PROFESSIONAL: negocio preferido respetado", sel4?.membership.business_id === PROF_BIZ);

// ---------------------------------------------------------------------------
// Estático: validación server-side en cada página/servicio
// ---------------------------------------------------------------------------
const read = (...p: string[]) => fs.readFileSync(path.join(...p), "utf8");
const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });

const dashboardDir = path.join("src", "app", "(dashboard)");
const pages = walk(dashboardDir).filter((f) => f.endsWith("page.tsx"));
const pageGuards: Record<string, string> = {
  "/panel": `requireModulePage("dashboard")`,
  "/contactos": `requireModulePage("contacts")`,
  "/agenda": `requireModulePage("agenda")`,
  "/servicios": `requireModulePage("services")`,
  "/segmentos": `requireModulePage("campaigns")`,
  "/plantillas": `requireModulePage("campaigns")`,
  "/campanas": `requireModulePage("campaigns")`,
  "/campanas/nueva": `requireModulePage("campaigns")`,
  "/agente-ia": `requireModulePage("ai_agent")`,
  "/configuracion": `requireModulePage("settings")`,
  "/conversaciones": "redirect(accessDeniedRoute())",
  "/configuracion/equipo": `reason === "forbidden"`,
};
for (const file of pages) {
  const route = "/" + path.relative(dashboardDir, path.dirname(file)).split(path.sep).join("/");
  const guard = pageGuards[route];
  assert(`página ${route}: protegida server-side`, Boolean(guard) && read(file).includes(guard!), guard ? undefined : "página sin guard registrado");
  const expectedModule = moduleForPath(route);
  if (guard?.startsWith("requireModulePage")) {
    assert(`página ${route}: módulo coincide con la ruta`, guard.includes(`"${expectedModule}"`));
  }
}

const convSvc = read("src", "services", "conversations", "conversations.service.ts");
assert("conversaciones: servicio exige módulo conversations", convSvc.includes(`canAccessModule(membership.role, "conversations")`));
const teamSvc = read("src", "services", "business", "team.service.ts");
assert("equipo: servicio exige canManageTeam antes de la RPC", teamSvc.indexOf("canManageTeam(") < teamSvc.indexOf("listBusinessMembers("));

const serviceModules: Array<[string[], string]> = [
  [["src", "services", "contacts", "board.service.ts"], `getWorkspaceForModule("contacts")`],
  [["src", "services", "contacts", "detail.service.ts"], `getWorkspaceForModule("contacts")`],
  [["src", "services", "campaigns", "campaigns.service.ts"], `getWorkspaceForModule("campaigns")`],
  [["src", "services", "templates", "templates.service.ts"], `getWorkspaceForModule("campaigns")`],
  [["src", "services", "segmentation", "segments.service.ts"], `getWorkspaceForModule("campaigns")`],
  [["src", "services", "segmentation", "sync-ai-segments.service.ts"], `getWorkspaceForModule("campaigns")`],
  [["src", "services", "ai", "ai-agent.service.ts"], `getWorkspaceForModule("ai_agent")`],
  [["src", "services", "clinic", "appointment.service.ts"], `requireClinicWorkspace("agenda"`],
  [["src", "services", "clinic", "services.service.ts"], `requireClinicWorkspace("services"`],
  [["src", "app", "(dashboard)", "actions", "clinic.ts"], `getWorkspaceForModule("agenda")`],
  [["src", "app", "(dashboard)", "actions", "sprint3.ts"], `getWorkspaceForModule("contacts")`],
];
for (const [p, needle] of serviceModules) {
  const text = read(...p);
  assert(`servicio ${p[p.length - 1]}: ${needle}`, text.includes(needle));
  assert(`servicio ${p[p.length - 1]}: sin getCurrentWorkspace directo`, !text.includes("businessService.getCurrentWorkspace()"));
}
assert("knowledge: escrituras exigen módulo knowledge", (read("src", "services", "ai", "ai-agent.service.ts").match(/requireAdminWorkspace\("knowledge"\)/g) ?? []).length === 2);
assert(
  "agenda: escrituras siguen siendo owner/admin",
  read("src", "services", "clinic", "appointment.service.ts").includes(`requireClinicWorkspace("agenda", { manage: true })`),
);

const srcFiles = walk("src").filter((f) => /\.(ts|tsx)$/.test(f));
const scattered = srcFiles.filter(
  (f) => !f.endsWith(path.join("lib", "permissions.ts")) && /role\s*(===|!==)\s*"(owner|admin|professional|member)"/.test(read(f)),
);
assert("sin condicionales de rol dispersos fuera de lib/permissions", scattered.length === 0, scattered.join(", "));

const sidebar = read("src", "components", "layout", "app-sidebar.tsx");
assert("sidebar: filtra por canAccessModule", sidebar.includes("canAccessModule(role, item.module)"));
assert("sidebar: 'Nueva Campaña' solo con módulo campaigns", sidebar.includes(`canAccessModule(role, "campaigns")`));

const webhook = read("src", "services", "whatsapp", "webhook.service.ts");
assert("webhook sin cambios de permisos", !/permissions|access\.service/.test(webhook));

const prohibited = srcFiles.filter((f) => /business_invitations|business_member_resource_access|access_scope|professional_user_id|inviteUserByEmail/.test(read(f)));
assert("sin invitaciones / vinculación profesional / access_scope", prohibited.length === 0, prohibited.join(", "));
assert("migración sin columnas nuevas de vinculación", !/resource_id|professional_user_id|access_scope|create table/i.test(MIGRATION));
assert("migración sin staff", !/staff/i.test(MIGRATION));
const staffRefs = srcFiles.filter((f) => /["']staff["']|["']Recepción["']/.test(read(f)));
assert("src sin rol staff ni etiqueta Recepción", staffRefs.length === 0, staffRefs.join(", "));

// ---------------------------------------------------------------------------
// DB (migración aplicada dentro de transacciones revertidas)
// ---------------------------------------------------------------------------
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});
await client.connect();

async function asUser(userId: string) {
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: "authenticated" })]);
  await client.query("set local role authenticated");
}
async function asPostgres() {
  await client.query("reset role");
}
async function inTx<T>(fn: () => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    await client.query(MIGRATION);
    return await fn();
  } finally {
    await client.query("rollback");
  }
}

const DATA_TABLES = [
  "contacts",
  "conversations",
  "messages",
  "clinic_appointments",
  "clinic_calendar_resources",
  "clinic_availability",
  "clinic_services",
  "ai_agent_settings",
  "ai_knowledge_entries",
  "ai_analysis",
  "campaigns",
  "templates",
  "segments",
];
async function visibleCounts(businessId: string) {
  const out: Record<string, number> = {};
  for (const t of DATA_TABLES) {
    const r = await client.query(`select count(*)::int n from public.${t} where business_id = $1`, [businessId]);
    out[t] = r.rows[0].n;
  }
  return out;
}

async function snapshot() {
  const r = await client.query(
    `select
       (select string_agg(user_id::text || ':' || business_id::text || ':' || role, ',' order by user_id, business_id) from public.business_users) as roles,
       (select count(*)::int from public.business_users) as memberships,
       (select string_agg(user_id::text, ',') from public.business_users where business_id = $1 and role = 'owner') as pastore_owner,
       (select count(*)::int from public.clinic_appointments where business_id = $1) as appointments,
       (select max(updated_at)::text from public.clinic_appointments where business_id = $1) as appt_updated,
       (select count(*)::int from public.clinic_appointments where id = $2) as protected_appt,
       (select enabled from public.ai_agent_settings where business_id = $1) as agent_enabled,
       (select pg_get_functiondef('public.is_business_member(uuid)'::regprocedure)) as fn_member`,
    [PASTORE_ID, PROTECTED_APPT],
  );
  return r.rows[0] as Record<string, unknown>;
}

try {
  const before = await snapshot();
  const owner = (await client.query<{ user_id: string }>(`select user_id from public.business_users where business_id = $1 and role = 'owner' limit 1`, [PASTORE_ID])).rows[0]?.user_id;
  const other = (await client.query<{ user_id: string; business_id: string }>(
    `select user_id, business_id from public.business_users where business_id <> $1 and role = 'owner' limit 1`,
    [PASTORE_ID],
  )).rows[0];
  assert("setup: owner de Pastore y usuario de otro negocio", Boolean(owner && other));

  // Visibilidad del owner antes de la migración (sin tx de migración)
  await client.query("begin");
  await asUser(owner!);
  const ownerBefore = await visibleCounts(PASTORE_ID);
  await client.query("rollback");

  if (owner && other) {
    // CHECK
    await inTx(async () => {
      const code = await client
        .query(`insert into public.business_users (business_id, user_id, role) values ($1, $2, 'staff')`, [PASTORE_ID, other.user_id])
        .then(() => null)
        .catch((e: { code?: string }) => e.code ?? "error");
      assert("DB: CHECK rechaza staff", code === "23514", `code=${code}`);
    });
    await inTx(async () => {
      const def = await client.query(`select pg_get_constraintdef(oid) d from pg_constraint where conname = 'business_users_role_check'`);
      const d = String(def.rows[0]?.d ?? "");
      assert("DB: CHECK = owner, admin, professional, member", ["owner", "admin", "professional", "member"].every((r) => d.includes(`'${r}'`)) && !d.includes("staff"), d);
    });
    await inTx(async () => {
      const ok = await client.query(`insert into public.business_users (business_id, user_id, role) values ($1, $2, 'professional') returning id`, [PASTORE_ID, other.user_id]);
      assert("DB: CHECK admite professional", ok.rowCount === 1);
    });
    await inTx(async () => {
      const code = await client
        .query(`insert into public.business_users (business_id, user_id, role) values ($1, $2, 'superadmin')`, [PASTORE_ID, other.user_id])
        .then(() => null)
        .catch((e: { code?: string }) => e.code ?? "error");
      assert("DB: CHECK rechaza roles no definidos", code === "23514", `code=${code}`);
    });

    // OWNER: misma visibilidad que antes
    await inTx(async () => {
      await asUser(owner);
      const after = await visibleCounts(PASTORE_ID);
      assert("OWNER: visibilidad RLS idéntica tras la migración", JSON.stringify(after) === JSON.stringify(ownerBefore));
      const admin = await client.query(`select public.is_business_admin($1) a`, [PASTORE_ID]);
      assert("OWNER: is_business_admin", admin.rows[0].a === true);
    });

    // ADMIN temporal
    await inTx(async () => {
      await client.query(`insert into public.business_users (business_id, user_id, role) values ($1, $2, 'admin')`, [PASTORE_ID, other.user_id]);
      await asUser(other.user_id);
      const counts = await visibleCounts(PASTORE_ID);
      assert("ADMIN: ve lo mismo que el owner", JSON.stringify(counts) === JSON.stringify(ownerBefore));
      const team = await client.query(`select count(*)::int n from public.list_business_members($1)`, [PASTORE_ID]);
      assert("ADMIN: puede listar Equipo", team.rows[0].n >= 2);
    });

    // A ↔ B: professional de Pastore (owner temporalmente degradado dentro de la tx) sin acceso a B
    await inTx(async () => {
      await client.query(`update public.business_users set role = 'professional' where business_id = $1 and user_id = $2`, [PASTORE_ID, owner]);
      await asUser(owner);
      const b = await visibleCounts(other.business_id);
      assert("A→B: professional de A no ve datos de B", Object.values(b).every((n) => n === 0));
      const bBiz = await client.query(`select count(*)::int n from public.businesses where id = $1`, [other.business_id]);
      assert("A→B: professional de A no ve la ficha de B", bBiz.rows[0].n === 0);
      const m = await client.query(`select public.is_business_member($1) m, public.has_business_membership($1) h`, [other.business_id]);
      assert("A→B: is_business_member(B) y has_business_membership(B) = false", m.rows[0].m === false && m.rows[0].h === false);
    });

    // PROFESSIONAL temporal
    await inTx(async () => {
      await client.query(`insert into public.business_users (business_id, user_id, role) values ($1, $2, 'professional')`, [PASTORE_ID, other.user_id]);
      await asUser(other.user_id);
      const counts = await visibleCounts(PASTORE_ID);
      const leaks = Object.entries(counts).filter(([, n]) => n > 0).map(([t]) => t);
      assert("PROFESSIONAL: sin acceso general a datos de la clínica (0 filas en todas las tablas)", leaks.length === 0, leaks.join(","));
      const biz = await client.query(`select (select count(*)::int from public.businesses where id = $1) b, (select count(*)::int from public.business_settings where business_id = $1) s`, [PASTORE_ID]);
      assert("PROFESSIONAL: puede leer la ficha del negocio para cargar el workspace", biz.rows[0].b === 1 && biz.rows[0].s === 1);
      const flags = await client.query(`select public.is_business_member($1) m, public.is_business_admin($1) a`, [PASTORE_ID]);
      assert("PROFESSIONAL: is_business_member = false, is_business_admin = false", flags.rows[0].m === false && flags.rows[0].a === false);
      await client.query("savepoint p");
      const ins = await client
        .query(`insert into public.contacts (business_id, phone, name) values ($1, '+10000000000', 'x')`, [PASTORE_ID])
        .then(() => "ok")
        .catch((e: { code?: string }) => e.code);
      await client.query("rollback to savepoint p");
      assert("PROFESSIONAL: no puede crear contactos (RLS)", ins === "42501", String(ins));
      const own = await client.query(`select count(*)::int n from public.business_users where business_id = $1`, [PASTORE_ID]);
      assert("PROFESSIONAL: membership válida (ve su propia fila, no la del resto del equipo)", own.rows[0].n === 1);
      const hm = await client.query(`select public.has_business_membership($1) h`, [PASTORE_ID]);
      assert("PROFESSIONAL: has_business_membership = true (resuelve workspace)", hm.rows[0].h === true);
      const upd = await client.query(`update public.ai_agent_settings set enabled = true where business_id = $1`, [PASTORE_ID]);
      assert("PROFESSIONAL: no puede modificar el agente (RLS, 0 filas)", upd.rowCount === 0);
      const updBiz = await client.query(`update public.business_settings set updated_at = updated_at where business_id = $1`, [PASTORE_ID]);
      assert("PROFESSIONAL: no puede modificar configuración (RLS, 0 filas)", updBiz.rowCount === 0);
      await client.query("savepoint t");
      const team = await client.query(`select 1 from public.list_business_members($1)`, [PASTORE_ID]).then(() => "ok").catch((e: { code?: string }) => e.code);
      await client.query("rollback to savepoint t");
      assert("PROFESSIONAL: Equipo denegado en DB (42501)", team === "42501", String(team));
    });

    // MEMBER temporal: compatibilidad
    await inTx(async () => {
      await client.query(`insert into public.business_users (business_id, user_id, role) values ($1, $2, 'member')`, [PASTORE_ID, other.user_id]);
      await asUser(other.user_id);
      const counts = await visibleCounts(PASTORE_ID);
      assert("MEMBER: misma lectura que antes (compatibilidad)", JSON.stringify(counts) === JSON.stringify(ownerBefore));
      const flags = await client.query(`select public.is_business_member($1) m, public.is_business_admin($1) a`, [PASTORE_ID]);
      assert("MEMBER: is_business_member sí, is_business_admin no", flags.rows[0].m === true && flags.rows[0].a === false);
    });

    // Funciones con search_path fijo y grants correctos
    await inTx(async () => {
      await asPostgres();
      const fn = await client.query<{ proname: string; prosecdef: boolean; proconfig: string[] | null }>(
        `select proname, prosecdef, proconfig from pg_proc where proname in ('has_business_membership','is_business_member') and pronamespace = 'public'::regnamespace`,
      );
      assert("funciones SECURITY DEFINER con search_path fijo", fn.rows.length === 2 && fn.rows.every((r) => r.prosecdef && (r.proconfig ?? []).some((c) => c.startsWith("search_path="))));
      const priv = await client.query(`select has_function_privilege('anon', 'public.has_business_membership(uuid)', 'execute') a`);
      assert("has_business_membership: anon sin EXECUTE", priv.rows[0].a === false);
    });
  }

  // HTTP sin sesión (opcional)
  const baseUrl = process.env.BASE_URL;
  if (baseUrl) {
    for (const p of ["/configuracion/equipo", "/agente-ia", "/conversaciones", "/agenda", "/contactos", "/panel"]) {
      const res = await fetch(`${baseUrl}${p}`, { redirect: "manual" });
      assert(`HTTP sin sesión ${p} → login`, res.status === 307 && (res.headers.get("location") ?? "").includes("/login"), `status=${res.status}`);
    }
  } else {
    console.log("SKIP HTTP (define BASE_URL)");
  }

  const after = await snapshot();
  assert("roles reales sin cambios", after.roles === before.roles && after.memberships === before.memberships);
  assert("Pastore conserva su owner", after.pastore_owner === before.pastore_owner && Boolean(after.pastore_owner));
  assert("Pastore: citas intactas", after.appointments === before.appointments && after.appt_updated === before.appt_updated);
  assert("Pastore: cita protegida sigue existiendo", after.protected_appt === 1);
  assert("Pastore: agente sigue desactivado", after.agent_enabled === false);
  assert("DB: is_business_member sin cambios fuera de las transacciones de test", after.fn_member === before.fn_member);
} finally {
  await client.end();
}

console.log(`\nRESULT passed=${passed} failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);
