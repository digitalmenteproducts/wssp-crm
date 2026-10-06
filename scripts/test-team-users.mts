/**
 * Tests de "Crear usuario" (Paso 5 simplificado) y "Cambiar contraseña".
 * Uso: npx tsx scripts/test-team-users.mts
 *
 * - Servicio probado con dependencias mock: no se llama a Supabase Admin ni se envían correos.
 * - La migración 20261005170000 se ejecuta DENTRO de cada transacción y se revierte (ROLLBACK);
 *   los auth users de prueba solo existen dentro de esas transacciones.
 * - Nunca imprime emails reales, contraseñas ni secretos.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";

import { APP_MODULES, canAccessModule } from "../src/lib/permissions";
import { CREATABLE_ROLES } from "../src/lib/team";
import { generateTemporaryPassword } from "../src/lib/temporary-password";
import { createBusinessUserSchema } from "../src/schemas/team";
import {
  notConfiguredCredentialsSender,
  sendBusinessUserCredentials,
} from "../src/services/business/credentials-mailer";
import { formatCredentialsForCopy } from "../src/lib/team";
import type { ChangePasswordDeps } from "../src/services/auth/auth.service";
import type { CreateBusinessUserDeps } from "../src/services/business/team-users.service";

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!value) continue;
    if (!(key in process.env) || !process.env[key]) process.env[key] = value;
  }
}
loadEnvLocal();

const PASTORE_ID = "ee05dfbd-839b-4f52-be6f-327080995e56";
const PROTECTED_APPT = "fe422bf9-c6fa-4195-8ef3-749ef228db22";
const MIGRATION = fs.readFileSync(path.join("supabase", "migrations", "20261005170000_add_business_member.sql"), "utf8");

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

// Captura de logs: ninguna contraseña temporal puede aparecer en consola.
const captured: string[] = [];
const originals = { log: console.log, error: console.error, warn: console.warn, info: console.info };
function startCapture() {
  for (const k of ["error", "warn", "info"] as const) {
    console[k] = (...args: unknown[]) => captured.push(args.map(String).join(" "));
  }
}
function stopCapture() {
  console.error = originals.error;
  console.warn = originals.warn;
  console.info = originals.info;
}

// ---------------------------------------------------------------------------
// Unit: roles, schema, contraseña temporal
// ---------------------------------------------------------------------------
assert("roles creables: admin, professional", CREATABLE_ROLES.join(",") === "admin,professional");
for (const role of ["owner", "member", "staff", "superadmin", ""]) {
  assert(`schema: rol ${role || "(vacío)"} rechazado`, !createBusinessUserSchema.safeParse({ name: "Ana", email: "a@b.co", role }).success);
}
const parsedOk = createBusinessUserSchema.safeParse({ name: " Ana ", email: " Ana@Example.COM ", role: "admin", business_id: "x" });
assert("schema: email normalizado y business_id del cliente descartado", parsedOk.success && parsedOk.data.email === "ana@example.com" && !("business_id" in parsedOk.data));
assert("schema: email inválido rechazado", !createBusinessUserSchema.safeParse({ name: "Ana", email: "no", role: "admin" }).success);
assert("schema: nombre vacío rechazado", !createBusinessUserSchema.safeParse({ name: " ", email: "a@b.co", role: "admin" }).success);

const samples = Array.from({ length: 2000 }, () => generateTemporaryPassword());
assert("contraseña: 16 caracteres", samples.every((p) => p.length === 16));
assert(
  "contraseña: mayúscula, minúscula, dígito y símbolo siempre",
  samples.every((p) => /[A-Z]/.test(p) && /[a-z]/.test(p) && /[2-9]/.test(p) && /[!@#$%*\-_+?]/.test(p)),
);
assert("contraseña: sin caracteres ambiguos", samples.every((p) => !/[0O1lI]/.test(p)));
assert("contraseña: 2000 generadas, todas distintas", new Set(samples).size === samples.length);
const pwSrc = fs.readFileSync(path.join("src", "lib", "temporary-password.ts"), "utf8");
assert("contraseña: CSPRNG (crypto.randomInt), sin Math.random", pwSrc.includes('from "node:crypto"') && pwSrc.includes("randomInt(") && !pwSrc.includes("Math.random"));

// ---------------------------------------------------------------------------
// Servicio con mocks (sin Supabase Admin, sin correo)
// ---------------------------------------------------------------------------
type Role = "owner" | "admin" | "professional" | "member";
const svc = await import("../src/services/business/team-users.service");

const FIXED_PASSWORD = "Tmp-Secret#9xQ2wZ";
function harness(role: Role, opts: { memberEmails?: string[]; createError?: "email_exists" | "failed"; addError?: "forbidden" | "already_member"; send?: boolean } = {}) {
  const calls = {
    generated: 0,
    created: [] as Array<{ email: string; password: string; name: string }>,
    added: [] as Array<{ businessId: string; userId: string; role: string }>,
    deleted: [] as string[],
    sent: [] as Array<{ email: string; temporaryPassword: string; loginUrl: string }>,
  };
  const deps = {
    resolveWorkspace: async () => ({
      ok: true as const,
      workspace: { business: { id: "server-business", name: "Clínica Test", timezone: "UTC" }, membership: { role } },
    }),
    listMemberEmails: async () => ({ emails: opts.memberEmails ?? [], error: null }),
    generatePassword: () => {
      calls.generated += 1;
      return FIXED_PASSWORD;
    },
    createAuthUser: async (input: { email: string; password: string; name: string }) => {
      calls.created.push(input);
      return opts.createError ? { userId: null, error: opts.createError } : { userId: "new-user-id", error: null };
    },
    deleteAuthUser: async (id: string) => {
      calls.deleted.push(id);
      return { error: null };
    },
    addMember: async (input: { businessId: string; userId: string; role: string }) => {
      calls.added.push(input);
      return { error: opts.addError ?? null };
    },
    sender: async (c: { email: string; temporaryPassword: string; loginUrl: string }) => {
      calls.sent.push(c);
      return opts.send ? { sent: true as const } : { sent: false as const, reason: "not_configured" as const };
    },
    loginUrl: () => "https://app.test/login",
  };
  const typed = deps as unknown as CreateBusinessUserDeps;
  return {
    calls,
    create: (input: unknown) => svc.createBusinessUser(input, typed),
    createAndSend: (input: unknown) => svc.createBusinessUserAndSendCredentials(input, typed),
  };
}

startCapture();
const results: string[] = [];
const input = (role: string, extra: Record<string, unknown> = {}) => ({ name: "Dra. Ana", email: "ana@example.com", role, ...extra });

for (const [n, actor, target] of [[1, "owner", "admin"], [2, "owner", "professional"], [3, "admin", "admin"], [4, "admin", "professional"]] as const) {
  const t = harness(actor);
  const r = await t.create(input(target));
  results.push(JSON.stringify(r.ok ? { ...r, temporaryPassword: "<redacted>" } : r));
  assert(
    `${n}. ${actor} puede crear ${target}`,
    r.ok && t.calls.created.length === 1 && t.calls.added[0]?.role === target && t.calls.added[0]?.userId === "new-user-id",
  );
}
for (const [n, actor] of [[5, "professional"], [6, "member"]] as const) {
  const t = harness(actor);
  const r = await t.create(input("admin"));
  assert(`${n}. ${actor} no puede crear usuarios (sin llamar a Supabase Admin)`, !r.ok && t.calls.created.length === 0 && t.calls.generated === 0);
}
for (const [n, role] of [[7, "owner"], [8, "member"], [9, "staff"]] as const) {
  const t = harness("owner");
  const r = await t.create(input(role));
  assert(`${n}. no se puede crear ${role}`, !r.ok && t.calls.created.length === 0 && t.calls.added.length === 0);
}
{
  const t = harness("admin");
  await t.create(input("professional", { business_id: "client-business", businessId: "client-business" }));
  assert("10. business_id sale del workspace activo (se ignora el del cliente)", t.calls.added[0]?.businessId === "server-business");
}
{
  const t = harness("owner");
  const r = await t.create(input("professional"));
  assert("12. el usuario creado recibe el rol elegido", r.ok && r.user.role === "professional" && t.calls.added[0]?.role === "professional");
  assert("auth user creado con nombre, email normalizado y contraseña generada", t.calls.created[0]?.email === "ana@example.com" && t.calls.created[0]?.name === "Dra. Ana" && t.calls.created[0]?.password === FIXED_PASSWORD);
}
{
  const t = harness("owner", { memberEmails: ["ana@example.com"] });
  const r = await t.create(input("admin", { email: "ANA@example.com" }));
  assert("15. email ya en el mismo negocio → 'Este usuario ya pertenece al equipo.'", !r.ok && r.error === svc.ALREADY_IN_TEAM_ERROR);
  assert("15. no se crea auth user ni se genera contraseña", t.calls.created.length === 0 && t.calls.generated === 0);
}
{
  const t = harness("owner", { createError: "email_exists" });
  const r = await t.create(input("admin"));
  assert("email existente en otro negocio → rechazado sin crear otro usuario ni tocar su contraseña", !r.ok && r.error === svc.EMAIL_EXISTS_ERROR && t.calls.added.length === 0 && t.calls.deleted.length === 0);
}
{
  const t = harness("owner", { addError: "forbidden" });
  const r = await t.create(input("admin"));
  assert("11. si la DB rechaza la membership (otro negocio) se borra el auth user recién creado", !r.ok && t.calls.deleted[0] === "new-user-id");
}
{
  const t = harness("owner", { send: true });
  const r = await t.createAndSend(input("admin"));
  assert("envío: el proveedor recibe email, URL de acceso y contraseña", t.calls.sent[0]?.email === "ana@example.com" && t.calls.sent[0]?.loginUrl === "https://app.test/login" && t.calls.sent[0]?.temporaryPassword === FIXED_PASSWORD);
  assert("17. con correo enviado, la respuesta NO incluye la contraseña", r.ok && !JSON.stringify(r).includes(FIXED_PASSWORD));
}
{
  const t = harness("owner", { send: false });
  const r = await t.createAndSend(input("admin"));
  assert(
    "sin proveedor: resultado inmediato con email, contraseña y URL de acceso",
    r.ok && !r.emailSent && r.temporaryPassword === FIXED_PASSWORD && r.email === "ana@example.com" && r.loginUrl === "https://app.test/login",
  );
  if (r.ok && !r.emailSent) {
    const copied = formatCredentialsForCopy(r);
    assert(
      "Copiar credenciales: texto con URL, email y contraseña temporal",
      copied === `Acceso al sistema\nURL: https://app.test/login\nEmail: ana@example.com\nContraseña temporal: ${FIXED_PASSWORD}`,
    );
  }
}
{
  const t = harness("owner", { createError: "failed" });
  const r = await t.createAndSend(input("admin"));
  assert("contraseña temporal solo en el resultado de una creación correcta (no en fallos)", !r.ok && !JSON.stringify(r).includes(FIXED_PASSWORD));
}
{
  const t = harness("owner", { addError: "forbidden" });
  const r = await t.createAndSend(input("admin"));
  assert("si falla la membership no se muestra contraseña", !r.ok && !JSON.stringify(r).includes(FIXED_PASSWORD) && t.calls.sent.length === 0);
}
{
  const t = harness("owner");
  const r = await t.createAndSend(input("owner"));
  assert("17. errores sin contraseña", !r.ok && !JSON.stringify(r).includes(FIXED_PASSWORD));
}
{
  const thrown = await sendBusinessUserCredentials(
    { name: "a", email: "a@b.co", role: "admin", businessName: "x", loginUrl: "u", temporaryPassword: FIXED_PASSWORD },
    async () => {
      throw new Error(`smtp failed for ${FIXED_PASSWORD}`);
    },
  );
  assert("envío: un fallo del proveedor no se propaga ni se registra", !thrown.sent && thrown.reason === "failed");
}
const notConfigured = await notConfiguredCredentialsSender({ name: "a", email: "a@b.co", role: "admin", businessName: "x", loginUrl: "u", temporaryPassword: "x" });
assert("20. proveedor por defecto: no configurado, no envía nada", !notConfigured.sent && notConfigured.reason === "not_configured");

// 19. Cambiar contraseña (cuenta propia, cualquier rol)
const authSvc = await import("../src/services/auth/auth.service");
{
  const updates: string[] = [];
  const deps = (userId: string | null, error: { message: string } | null = null) =>
    ({
      getCurrentUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: null }),
      updatePassword: async (...args: unknown[]) => {
        updates.push(JSON.stringify(args));
        return { data: {}, error };
      },
    }) as unknown as ChangePasswordDeps;
  const NEW = "NuevaClave2026";
  for (const role of ["owner", "admin", "professional", "member"] as const) {
    const before = updates.length;
    const r = await authSvc.changePassword({ password: NEW, confirm: NEW }, deps(`user-${role}`));
    assert(
      `19. ${role} puede cambiar su propia contraseña (Supabase updateUser con su sesión)`,
      r.ok && r.message === "Contraseña actualizada correctamente." && updates.length === before + 1 && updates.at(-1) === JSON.stringify([NEW]),
    );
  }
  const n = updates.length;
  const anon = await authSvc.changePassword({ password: NEW, confirm: NEW }, deps(null));
  assert("19. sin sesión → rechazado sin llamar a Supabase", !anon.ok && updates.length === n);
  const mismatch = await authSvc.changePassword({ password: NEW, confirm: "OtraClave2026" }, deps("u1"));
  assert("19. contraseñas diferentes → rechazado", !mismatch.ok && updates.length === n);
  for (const bad of ["corta1", "solotextolargo", "123456789012", "a1".repeat(40)]) {
    const r = await authSvc.changePassword({ password: bad, confirm: bad }, deps("u1"));
    assert(`19. contraseña inválida rechazada (${bad.length} caracteres)`, !r.ok && updates.length === n);
  }
  const other = await authSvc.changePassword({ password: NEW, confirm: NEW, userId: "victim-id", user_id: "victim-id", email: "victim@x.co" }, deps("u1"));
  assert(
    "19. nunca apunta a otro usuario: user_id/email del cliente se ignoran, solo se envía la contraseña",
    other.ok && updates.at(-1) === JSON.stringify([NEW]),
  );
  const same = await authSvc.changePassword({ password: NEW, confirm: NEW }, deps("u1", { message: "New password should be different from the old password." }));
  assert("19. misma contraseña → mensaje claro", !same.ok && same.error.includes("distinta"));
}
stopCapture();
assert("17. ninguna contraseña temporal aparece en logs", !captured.some((l) => l.includes(FIXED_PASSWORD)));
assert("17. resultados registrados en el test sin contraseña", !results.some((r) => r.includes(FIXED_PASSWORD)));

// ---------------------------------------------------------------------------
// Estático
// ---------------------------------------------------------------------------
const read = (...p: string[]) => fs.readFileSync(path.join(...p), "utf8");
const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
const srcFiles = walk("src").filter((f) => /\.(ts|tsx)$/.test(f));
const clientFiles = srcFiles.filter((f) => /^\s*["']use client["']/.test(read(f)));

const leakyClients = clientFiles.filter((f) =>
  /supabase\/admin|auth-admin\.repository|team-users\.service|temporary-password|credentials-mailer|SUPABASE_SERVICE_ROLE_KEY/.test(read(f)),
);
assert("18. ningún Client Component importa service role / auth admin / generador", leakyClients.length === 0, leakyClients.join(", "));
const adminCallers = srcFiles.filter((f) => /auth\.admin\./.test(read(f)));
assert("18. auth.admin solo en repositories/auth-admin.repository.ts", adminCallers.length === 1 && adminCallers[0].endsWith(path.join("repositories", "auth-admin.repository.ts")), adminCallers.join(", "));
assert("18. sin variable pública con service role", !srcFiles.some((f) => /NEXT_PUBLIC_[A-Z_]*SERVICE_ROLE/.test(read(f))));
const staticDir = path.join(".next", "static");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (fs.existsSync(staticDir) && serviceKey.length > 20) {
  const leaks = walk(staticDir).filter((f) => /\.(js|css|html|json)$/.test(f) && fs.readFileSync(f, "utf8").includes(serviceKey));
  assert("18. la service role key no aparece en los bundles del navegador (.next/static)", leaks.length === 0, `${leaks.length} archivos`);
} else {
  console.log("SKIP 18 bundle (sin .next/static o sin key)");
}

const authAdmin = read("src", "repositories", "auth-admin.repository.ts");
assert("auth user con email_confirm: true", authAdmin.includes("email_confirm: true"));
assert("usuario existente: nunca se actualiza su contraseña (sin updateUserById)", !srcFiles.some((f) => /updateUserById/.test(read(f))));
const svcSrc = read("src", "services", "business", "team-users.service.ts");
assert("servicio: negocio desde resolveCurrentWorkspace + permiso canManageTeam", svcSrc.includes("businessService.resolveCurrentWorkspace") && svcSrc.includes("canManageTeam(membership.role)"));
assert("servicio: createBusinessUser separado de sendBusinessUserCredentials", /export async function createBusinessUser\(/.test(svcSrc) && read("src", "services", "business", "credentials-mailer.ts").includes("export async function sendBusinessUserCredentials("));
const passwordLogs = srcFiles.filter((f) => /console\.\w+\([^)]*(temporaryPassword|password)/i.test(read(f)));
assert("17. ningún console.* con contraseñas en src", passwordLogs.length === 0, passwordLogs.join(", "));
const mailer = read("src", "services", "business", "credentials-mailer.ts");
assert("20. capa de correo sin red ni proveedor instalado", !/fetch\(|nodemailer|resend|sendgrid/i.test(mailer));
const action = read("src", "app", "(dashboard)", "configuracion", "equipo", "actions.ts");
assert("acción: solo nombre, email y rol (sin business_id)", !/business_id|businessId/.test(action));
const dialog = read("src", "components", "team", "create-user-dialog.tsx");
assert("modal: roles desde CREATABLE_ROLES", dialog.includes("CREATABLE_ROLES.map") && !/value="(owner|member|staff)"/.test(dialog));
const equipo = read("src", "app", "(dashboard)", "configuracion", "equipo", "page.tsx");
assert("Equipo: botón Crear usuario habilitado", equipo.includes("<CreateUserDialog />") && !equipo.includes("Disponible próximamente"));
// Cambiar contraseña: sesión propia, todos los roles, sin URL
const authRepo = read("src", "repositories", "auth.repository.ts");
const updateFn = authRepo.slice(authRepo.indexOf("export async function updatePassword"), authRepo.indexOf("export async function signOut"));
assert("cambio de contraseña: cliente de sesión + auth.updateUser (sin service role)", updateFn.includes("await createClient()") && updateFn.includes("auth.updateUser({ password })") && !/admin/i.test(updateFn));
const authSvcSrc = read("src", "services", "auth", "auth.service.ts");
const changeFn = authSvcSrc.slice(authSvcSrc.indexOf("export async function changePassword"), authSvcSrc.indexOf("export async function logout"));
assert("cambio de contraseña: no depende del rol ni del negocio", !/Workspace|canAccessModule|canManage|membership/.test(changeFn));
const header = read("src", "components", "layout", "app-header.tsx");
const layout = read("src", "app", "(dashboard)", "layout.tsx");
const userMenu = read("src", "components", "layout", "user-menu.tsx");
assert("menú de usuario en el header del dashboard (todos los roles)", header.includes("<UserMenu") && layout.includes("<AppHeader") && !/role/.test(header));
assert("menú: 'Cambiar contraseña' + 'Cerrar sesión'", userMenu.includes("Cambiar contraseña") && userMenu.includes("logoutAction") && userMenu.includes("changePasswordAction"));
assert("modal: nueva contraseña + confirmación (type=password)", (userMenu.match(/type="password"/g) ?? []).length === 2 && userMenu.includes("Confirmar nueva contraseña"));

// Contraseñas nunca en URL ni tras refrescar
const passwordForms = [userMenu, dialog];
assert("formularios por Server Action (POST), sin method=get", passwordForms.every((f) => f.includes("action={formAction}") && !/method=["']get/i.test(f)));
const urlLeaks = srcFiles.filter((f) => /(searchParams|URLSearchParams|router\.(push|replace)|redirect\()[^\n]*(password|temporaryPassword)/i.test(read(f)));
assert("ninguna contraseña en URLs (searchParams/redirect/router)", urlLeaks.length === 0, urlLeaks.join(", "));
const teamSvc = read("src", "services", "business", "team.service.ts");
assert(
  "tras refrescar: Equipo no recibe ni renderiza contraseñas (solo el estado efímero del modal)",
  !/password/i.test(teamSvc) && !/password/i.test(equipo) && !/password/i.test(read("src", "components", "team", "team-members-table.tsx")),
);
assert("al cerrar el modal se remonta el formulario (se descarta la contraseña del estado)", dialog.includes("key={formKey}") && dialog.includes("setFormKey((k) => k + 1)"));
assert("modal: aviso de una sola vez + URL + Copiar credenciales", dialog.includes("Guarda esta contraseña ahora. Por seguridad no volverá a mostrarse.") && dialog.includes("URL de acceso") && dialog.includes("Copiar credenciales"));
assert("copiar: solo portapapeles, sin envío", dialog.includes("navigator.clipboard.writeText") && !/fetch\(|sendBusinessUserCredentials/.test(dialog));
const migrations = fs.readdirSync(path.join("supabase", "migrations")).filter((f) => f >= "20261005170000");
assert("migración única del paso: 20261005170000_add_business_member.sql", migrations.join(",") === "20261005170000_add_business_member.sql", migrations.join(","));

assert("limpieza: sin restos del flujo de invitaciones", !srcFiles.some((f) => /business_invitations|inviteUserByEmail|signInWithOtp|\/invitacion|accept_my_business_invitations/.test(read(f))));
assert("limpieza: migración business_invitations eliminada", !fs.readdirSync(path.join("supabase", "migrations")).some((f) => f.includes("business_invitations")));
const bizSvc = read("src", "services", "business", "business.service.ts");
assert("ensureWorkspaceForUser sin lógica de invitaciones", !/invitation|invited_at/i.test(bizSvc));
assert("13. sin vinculación con clinic_calendar_resources (Paso 6)", !/clinic_calendar_resources/.test(MIGRATION) && !svcSrc.includes("calendar"));
assert("16. migración sin tablas ni columnas nuevas", !/create table|alter table|add column/i.test(MIGRATION));

// ---------------------------------------------------------------------------
// DB: RPC add_business_member con fixtures en transacciones revertidas
// ---------------------------------------------------------------------------
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
await client.connect();
const q = (sql: string, params: unknown[] = []) => client.query(sql, params);
async function asUser(userId: string) {
  await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: "authenticated" })]);
  await q("set local role authenticated");
}
async function asPostgres() {
  await q("reset role");
}
async function errCode(sql: string, params: unknown[] = []): Promise<string | null> {
  await q("savepoint e");
  try {
    await q(sql, params);
    await q("release savepoint e");
    return null;
  } catch (e) {
    await q("rollback to savepoint e");
    const err = e as { code?: string; message?: string };
    return `${err.code ?? "?"}:${err.message ?? ""}`;
  }
}

const tag = randomUUID().slice(0, 8);
async function newUser(label: string) {
  const id = randomUUID();
  await q(
    `insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, now(), '{}'::jsonb, '{}'::jsonb, now(), now())`,
    [id, `${label}-${tag}@test.invalid`],
  );
  return id;
}
type Fx = { bizA: string; bizB: string; ownerA: string; adminA: string; profA: string; memberA: string; ownerB: string };
async function fixtures(): Promise<Fx> {
  const mk = async (n: string) => (await q(`insert into public.businesses (name, slug) values ($1, $2) returning id`, [n, `test-users-${n}-${tag}`])).rows[0].id as string;
  const fx = {
    bizA: await mk("a"),
    bizB: await mk("b"),
    ownerA: await newUser("owner-a"),
    adminA: await newUser("admin-a"),
    profA: await newUser("prof-a"),
    memberA: await newUser("member-a"),
    ownerB: await newUser("owner-b"),
  };
  const add = (b: string, u: string, r: string) => q(`insert into public.business_users (business_id, user_id, role) values ($1, $2, $3)`, [b, u, r]);
  await add(fx.bizA, fx.ownerA, "owner");
  await add(fx.bizA, fx.adminA, "admin");
  await add(fx.bizA, fx.profA, "professional");
  await add(fx.bizA, fx.memberA, "member");
  await add(fx.bizB, fx.ownerB, "owner");
  return fx;
}
async function inTx(fn: (fx: Fx) => Promise<void>) {
  await q("begin");
  try {
    await q(MIGRATION);
    await fn(await fixtures());
  } finally {
    await q("rollback");
  }
}
const addSql = `select public.add_business_member($1, $2, $3) id`;
const DATA_TABLES = ["contacts", "conversations", "messages", "clinic_appointments", "clinic_calendar_resources", "clinic_services", "ai_agent_settings", "ai_knowledge_entries", "campaigns", "templates", "segments"];

async function snapshot() {
  return (
    await q(
      `select (select count(*)::int from auth.users) users,
              (select md5(string_agg(id::text || coalesce(updated_at::text, '') || coalesce(encrypted_password, ''), ',' order by id)) from auth.users) users_sig,
              (select md5(string_agg(user_id::text || business_id::text || role, ',' order by user_id, business_id)) from public.business_users) mems,
              (select count(*)::int from public.businesses) businesses,
              (select string_agg(user_id::text, ',') from public.business_users where business_id = $1 and role = 'owner') pastore_owner,
              (select count(*)::int from public.clinic_appointments where business_id = $1) appts,
              (select count(*)::int from public.clinic_appointments where id = $2) protected_appt,
              (select enabled from public.ai_agent_settings where business_id = $1) agent,
              to_regprocedure('public.add_business_member(uuid,uuid,text)')::text rpc`,
      [PASTORE_ID, PROTECTED_APPT],
    )
  ).rows[0] as Record<string, unknown>;
}

try {
  const before = await snapshot();

  await inTx(async (fx) => {
    const roleOf = async (u: string, b: string) =>
      (await q(`select role from public.business_users where user_id = $1 and business_id = $2`, [u, b])).rows[0]?.role as string | undefined;
    for (const [n, actor, actorId, target] of [
      [1, "owner", fx.ownerA, "admin"],
      [2, "owner", fx.ownerA, "professional"],
      [3, "admin", fx.adminA, "admin"],
      [4, "admin", fx.adminA, "professional"],
    ] as const) {
      await asPostgres();
      const nu = await newUser(`new-${n}`);
      await asUser(actorId);
      const code = await errCode(addSql, [fx.bizA, nu, target]);
      await asPostgres();
      assert(`${n} DB: ${actor} crea membership ${target}`, code === null && (await roleOf(nu, fx.bizA)) === target, String(code));
    }

    await asPostgres();
    const victim = await newUser("victim");
    for (const [n, actorId, label] of [[5, fx.profA, "professional"], [6, fx.memberA, "member"]] as const) {
      await asUser(actorId);
      const code = await errCode(addSql, [fx.bizA, victim, "admin"]);
      assert(`${n} DB: ${label} no puede crear memberships (42501)`, code?.startsWith("42501") === true, String(code));
    }
    await asUser(fx.ownerA);
    for (const [n, role] of [[7, "owner"], [8, "member"], [9, "staff"]] as const) {
      const code = await errCode(addSql, [fx.bizA, victim, role]);
      assert(`${n} DB: rol ${role} rechazado (22023)`, code?.startsWith("22023") === true, String(code));
    }
    assert("DB: rol arbitrario rechazado", (await errCode(addSql, [fx.bizA, victim, "superadmin"]))?.startsWith("22023") === true);
    assert("DB: usuario inexistente rechazado", (await errCode(addSql, [fx.bizA, randomUUID(), "admin"]))?.startsWith("22023") === true);

    // 11: A no puede crear membership en B
    assert("11 DB: owner de A no puede crear membership en B (42501)", (await errCode(addSql, [fx.bizB, victim, "admin"]))?.startsWith("42501") === true);
    await asUser(fx.adminA);
    assert("11 DB: admin de A no puede crear membership en B (42501)", (await errCode(addSql, [fx.bizB, victim, "professional"]))?.startsWith("42501") === true);
    const insDirect = await errCode(`insert into public.business_users (business_id, user_id, role) values ($1, $2, 'admin')`, [fx.bizB, victim]);
    assert("11 DB: insert directo en business_users bloqueado por RLS", insDirect?.startsWith("42501") === true, String(insDirect));
    await asPostgres();
    const inB = await q(`select count(*)::int n from public.business_users where business_id = $1 and user_id = $2`, [fx.bizB, victim]);
    assert("11 DB: B sin memberships nuevas", inB.rows[0].n === 0);

    // 15: duplicado
    await asUser(fx.ownerA);
    const dup = await errCode(addSql, [fx.bizA, fx.adminA, "professional"]);
    assert("15 DB: membership duplicada rechazada (already_member) sin cambiar el rol", dup?.includes("already_member") === true && (await (async () => {
      await asPostgres();
      return roleOf(fx.adminA, fx.bizA);
    })()) === "admin", String(dup));

    // 12/13/14: profesional y admin recién creados
    await asPostgres();
    const prof = await newUser("doctor");
    const adm = await newUser("gerente");
    await asUser(fx.ownerA);
    await q(addSql, [fx.bizA, prof, "professional"]);
    await q(addSql, [fx.bizA, adm, "admin"]);
    await asPostgres();
    assert("12 DB: roles correctos", (await roleOf(prof, fx.bizA)) === "professional" && (await roleOf(adm, fx.bizA)) === "admin");

    await asUser(prof);
    let leaked = 0;
    for (const t of DATA_TABLES) leaked += (await q(`select count(*)::int n from public.${t} where business_id = $1`, [fx.bizA])).rows[0].n;
    const flags = await q(`select public.is_business_member($1) m, public.is_business_admin($1) a, public.has_business_membership($1) h`, [fx.bizA]);
    assert("13 DB: professional creado sin datos operativos (0 filas)", leaked === 0);
    assert("13 DB: professional resuelve workspace pero no es member/admin", flags.rows[0].h === true && flags.rows[0].m === false && flags.rows[0].a === false);
    assert("13 RBAC: professional solo Panel", APP_MODULES.filter((m) => canAccessModule("professional", m)).join(",") === "dashboard");
    assert("13 DB: professional no puede crear usuarios", (await errCode(addSql, [fx.bizA, victim, "professional"]))?.startsWith("42501") === true);

    await asUser(adm);
    const isAdmin = await q(`select public.is_business_admin($1) a`, [fx.bizA]);
    const team = await q(`select count(*)::int n from public.list_business_members($1)`, [fx.bizA]);
    assert("14 DB: admin creado es is_business_admin y ve Equipo", isAdmin.rows[0].a === true && team.rows[0].n >= 7);
    assert("14 DB: admin creado puede crear usuarios", (await errCode(addSql, [fx.bizA, victim, "professional"])) === null);
    assert("14 RBAC: admin con todos los módulos", APP_MODULES.every((m) => canAccessModule("admin", m)));
  });

  await inTx(async () => {
    await asPostgres();
    const g = await q(`select has_function_privilege('anon', 'public.add_business_member(uuid,uuid,text)', 'execute') a`);
    assert("DB: anon sin EXECUTE en add_business_member", g.rows[0].a === false);
    const fn = await q(`select prosecdef s, array_to_string(proconfig, ',') c from pg_proc where proname = 'add_business_member' and pronamespace = 'public'::regnamespace`);
    assert("DB: SECURITY DEFINER con search_path fijo", fn.rows[0]?.s === true && String(fn.rows[0]?.c).includes("search_path="));
    const cols = await q(`select count(*)::int n from information_schema.columns where table_schema = 'public' and column_name ilike '%password%'`);
    assert("16 DB: ninguna tabla propia (public) tiene columnas de contraseña", cols.rows[0].n === 0);
  });

  const after = await snapshot();
  assert("real: no se crearon usuarios reales ni se cambiaron contraseñas", after.users === before.users && after.users_sig === before.users_sig);
  assert("real: memberships y negocios sin cambios", after.mems === before.mems && after.businesses === before.businesses);
  assert("real: estado de add_business_member sin cambios fuera del test", after.rpc === before.rpc);
  assert("Pastore: conserva su owner", after.pastore_owner === before.pastore_owner && Boolean(after.pastore_owner));
  assert("Pastore: citas intactas", after.appts === before.appts && after.protected_appt === 1);
  assert("Pastore: agente sigue desactivado", after.agent === false);
} finally {
  await client.end();
}

console.log(`\nRESULT passed=${passed} failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);
