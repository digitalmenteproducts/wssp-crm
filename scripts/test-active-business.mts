/**
 * Tests de resolución del negocio activo (multi-membership).
 * Uso: npx tsx scripts/test-active-business.mts
 *
 * - Lógica pura: selectActiveMembership.
 * - DB con rol authenticated simulado; las memberships temporales van en
 *   transacciones con ROLLBACK (no persiste nada).
 * - No envía WhatsApp, no activa agentes, no toca citas.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

import {
  ACTIVE_BUSINESS_COOKIE,
  isUuid,
  selectActiveMembership,
} from "../src/lib/active-business";
import type { BusinessRole, BusinessUser } from "../src/types/business";

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

function m(
  businessId: string,
  role: BusinessRole,
  createdAt: string,
  userId = "00000000-0000-4000-8000-0000000000aa",
): BusinessUser {
  return {
    id: `m-${businessId}`,
    business_id: businessId,
    user_id: userId,
    role,
    created_at: createdAt,
  };
}

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const GHOST = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

// ---------------------------------------------------------------------------
// Unit: selectActiveMembership
// ---------------------------------------------------------------------------
{
  const onlyA = [m(A, "owner", "2026-01-01T00:00:00Z")];

  const s1 = selectActiveMembership(onlyA, null);
  assert("1. una membership sin cookie → entra a A", s1?.membership.business_id === A && s1.source === "single");

  const sA = selectActiveMembership(onlyA, B);
  assert(
    "5/A. pertenece solo a A con cookie B → NO entra a B (usa A)",
    sA?.membership.business_id === A && sA.preferenceRejected === true,
  );

  const both = [
    m(A, "owner", "2026-01-01T00:00:00Z"),
    m(B, "member", "2026-02-01T00:00:00Z"),
  ];
  const sB = selectActiveMembership(both, B);
  assert(
    "2/3/B. pertenece a A y B con cookie B → entra a B",
    sB?.membership.business_id === B && sB.source === "preferred" && !sB.preferenceRejected,
  );

  const sBupper = selectActiveMembership(both, B.toUpperCase());
  assert("3. cookie válida en mayúsculas se reconoce", sBupper?.membership.business_id === B);

  const sGhost = selectActiveMembership(both, GHOST);
  assert(
    "4/D. cookie con business_id inexistente → se ignora y usa membership válida",
    sGhost?.membership.business_id === A && sGhost.preferenceRejected === true,
  );

  const sGarbage = selectActiveMembership(both, "'; drop table businesses; --");
  assert(
    "4. cookie manipulada (no UUID) → se ignora",
    sGarbage?.membership.business_id === A && sGarbage.preferenceRejected === true,
  );

  const sNone = selectActiveMembership(both, null);
  assert("2. varias memberships sin cookie → fallback determinista", sNone?.source === "fallback");

  const rolePriority = selectActiveMembership(
    [
      m(A, "member", "2025-01-01T00:00:00Z"),
      m(B, "admin", "2026-03-01T00:00:00Z"),
      m(C, "owner", "2026-06-01T00:00:00Z"),
    ],
    null,
  );
  assert("2. fallback prioriza owner > admin > member", rolePriority?.membership.business_id === C);

  const sameRole = selectActiveMembership(
    [m(B, "owner", "2026-05-01T00:00:00Z"), m(A, "owner", "2026-01-01T00:00:00Z")],
    null,
  );
  assert("2. mismo rol → la más antigua", sameRole?.membership.business_id === A);

  const tie = [m(B, "owner", "2026-01-01T00:00:00Z"), m(A, "owner", "2026-01-01T00:00:00Z")];
  const tie1 = selectActiveMembership(tie, null);
  const tie2 = selectActiveMembership([...tie].reverse(), null);
  assert(
    "2. empate total → determinista por business_id, independiente del orden",
    tie1?.membership.business_id === A && tie2?.membership.business_id === A,
  );

  assert("6. sin memberships → null (no inventa negocio)", selectActiveMembership([], A) === null);

  assert("cookie: nombre esperado", ACTIVE_BUSINESS_COOKIE === "active_business_id");
  assert("isUuid rechaza valores no UUID", !isUuid("abc") && !isUuid("") && !isUuid(null) && isUuid(A));
}

// ---------------------------------------------------------------------------
// Estático: única vía de resolución
// ---------------------------------------------------------------------------
{
  function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });
  }
  const files = walk("src").map((file) => ({
    file: file.replace(/\\/g, "/"),
    text: fs.readFileSync(file, "utf8"),
  }));

  const membershipQueries = files.filter((f) => /from\(\s*["']business_users["']\s*\)/.test(f.text));
  assert(
    "business_users solo se consulta en business.repository",
    membershipQueries.length === 1 && membershipQueries[0].file.endsWith("repositories/business.repository.ts"),
    membershipQueries.map((f) => f.file).join(", "),
  );

  const listCallers = files.filter(
    (f) => f.text.includes("listMembershipsByUserId(") && !f.file.endsWith("repositories/business.repository.ts"),
  );
  assert(
    "listMembershipsByUserId solo lo usa business.service",
    listCallers.length === 1 && listCallers[0].file.endsWith("services/business/business.service.ts"),
    listCallers.map((f) => f.file).join(", "),
  );

  assert(
    "findMembershipByUserId (oldest limit 1) eliminado",
    files.every((f) => !f.text.includes("findMembershipByUserId")),
  );

  const cookieReaders = files.filter(
    (f) => f.text.includes("ACTIVE_BUSINESS_COOKIE") &&
      !f.file.endsWith("lib/active-business.ts") &&
      !f.file.endsWith("lib/active-business-cookie.ts"),
  );
  assert("la cookie solo se maneja en lib/active-business*", cookieReaders.length === 0, cookieReaders.map((f) => f.file).join(", "));

  const clientCookie = files.filter(
    (f) => /^\s*["']use client["']/m.test(f.text) && /active-business/.test(f.text),
  );
  assert("ningún Client Component toca el negocio activo", clientCookie.length === 0);

  const cookieLib = fs.readFileSync(path.join("src", "lib", "active-business-cookie.ts"), "utf8");
  assert("cookie httpOnly + sameSite lax", /httpOnly:\s*true/.test(cookieLib) && /sameSite:\s*"lax"/.test(cookieLib));
}

// ---------------------------------------------------------------------------
// DB: RLS y memberships reales
// ---------------------------------------------------------------------------
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});
await client.connect();

async function asUserTx<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    await client.query("set local role authenticated");
    return await fn();
  } finally {
    await client.query("rollback");
  }
}

/** Misma consulta que listMembershipsByUserId, bajo RLS del usuario. */
async function listMembershipsAs(userId: string): Promise<BusinessUser[]> {
  const r = await client.query<BusinessUser>(
    `select id, business_id, user_id, role, created_at::text as created_at
     from public.business_users where user_id = $1
     order by created_at asc, business_id asc`,
    [userId],
  );
  return r.rows;
}

try {
  const all = await client.query<{ user_id: string; business_id: string }>(
    `select user_id, business_id from public.business_users`,
  );
  const users = [...new Set(all.rows.map((r) => r.user_id))];

  const pastoreOwner = await client.query<{ user_id: string }>(
    `select user_id from public.business_users where business_id = $1 and role = 'owner' limit 1`,
    [PASTORE_ID],
  );
  const pastoreUser = pastoreOwner.rows[0]?.user_id;
  assert("setup: owner de Pastore encontrado", Boolean(pastoreUser));

  const other = await client.query<{ business_id: string; user_id: string }>(
    `select business_id, user_id from public.business_users where business_id <> $1 limit 1`,
    [PASTORE_ID],
  );
  const otherBusiness = other.rows[0]?.business_id;
  const otherUser = other.rows[0]?.user_id;

  // 7. Compatibilidad: sin cookie, cada usuario real resuelve al mismo negocio que antes
  let compatible = 0;
  for (const userId of users) {
    const old = await client.query<{ business_id: string }>(
      `select business_id from public.business_users where user_id = $1
       order by created_at asc limit 1`,
      [userId],
    );
    const list = await asUserTx(userId, () => listMembershipsAs(userId));
    const sel = selectActiveMembership(list, null);
    if (sel?.membership.business_id === old.rows[0]?.business_id) compatible += 1;
  }
  assert(
    `7. compatibilidad: ${compatible}/${users.length} usuarios existentes resuelven al mismo negocio`,
    compatible === users.length && users.length > 0,
  );

  if (pastoreUser && otherBusiness) {
    // E. Pastore sigue en Pastore (con y sin cookie ajena)
    const list = await asUserTx(pastoreUser, () => listMembershipsAs(pastoreUser));
    assert("E. Pastore: RLS devuelve solo sus memberships", list.every((r) => r.user_id === pastoreUser));
    assert("E. Pastore sin cookie → Pastore", selectActiveMembership(list, null)?.membership.business_id === PASTORE_ID);
    const forged = selectActiveMembership(list, otherBusiness);
    assert(
      "A/5. Pastore con cookie de otro negocio real → sigue en Pastore",
      forged?.membership.business_id === PASTORE_ID && forged.preferenceRejected,
    );

    // A. La cookie no concede acceso: RLS bloquea el negocio ajeno
    await asUserTx(pastoreUser, async () => {
      const r = await client.query(
        `select
           public.is_business_member($1) as member,
           (select count(*)::int from public.businesses where id = $1) as biz,
           (select count(*)::int from public.business_users where business_id = $1) as memberships`,
        [otherBusiness],
      );
      const row = r.rows[0];
      assert(
        "A. negocio ajeno: is_business_member=false y RLS no lo expone",
        row.member === false && row.biz === 0 && row.memberships === 0,
      );
    });
  }

  // B. Varias memberships reales (temporal, ROLLBACK): cookie B → entra a B
  if (pastoreUser && otherBusiness && otherUser) {
    await client.query("begin");
    try {
      await client.query(
        `insert into public.business_users (business_id, user_id, role) values ($1, $2, 'member')`,
        [PASTORE_ID, otherUser],
      );
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: otherUser, role: "authenticated" }),
      ]);
      await client.query("set local role authenticated");
      const list = await listMembershipsAs(otherUser);
      assert("B. usuario con 2 memberships las ve ambas", list.length === 2);

      const toB = selectActiveMembership(list, PASTORE_ID);
      assert("B. cookie = segundo negocio válido → entra en él", toB?.membership.business_id === PASTORE_ID && toB.source === "preferred");

      const member = await client.query(`select public.is_business_member($1) as ok`, [PASTORE_ID]);
      assert("B. RLS reconoce la membership del negocio activo", member.rows[0].ok === true);

      const noCookie = selectActiveMembership(list, null);
      assert(
        "2. sin cookie con 2 memberships → prioriza su negocio owner (determinista)",
        noCookie?.membership.business_id === otherBusiness,
      );

      const ghost = selectActiveMembership(list, GHOST);
      assert("D. cookie inexistente con 2 memberships → membership válida", ghost?.membership.business_id === otherBusiness);
    } finally {
      await client.query("rollback");
    }
    const leftover = await client.query(
      `select count(*)::int as c from public.business_users where business_id = $1 and user_id = $2`,
      [PASTORE_ID, otherUser],
    );
    assert("B. membership temporal revertida (Pastore intacta)", leftover.rows[0].c === 0);
  }

  // 6 / ensureWorkspaceForUser: con membership, la RPC nunca crea otro negocio
  if (pastoreUser) {
    const before = await client.query(`select count(*)::int as c from public.businesses`);
    await asUserTx(pastoreUser, async () => {
      const r = await client.query<{ id: string }>(
        `select public.create_business_for_current_user('No crear', 'no-crear-test', null) as id`,
      );
      assert("6. RPC con membership existente devuelve su negocio (no crea)", r.rows[0].id === PASTORE_ID);
      const inside = await client.query(`select count(*)::int as c from public.businesses where slug = 'no-crear-test'`);
      assert("6. no se insertó negocio nuevo", inside.rows[0].c === 0);
    });
    const after = await client.query(`select count(*)::int as c from public.businesses`);
    assert("6. total de negocios sin cambios", before.rows[0].c === after.rows[0].c);
  }

  // 6. Usuario sin memberships: la selección no inventa negocio (la creación
  // queda solo en ensureWorkspaceForUser vía RPC).
  const svc = fs.readFileSync(path.join("src", "services", "business", "business.service.ts"), "utf8");
  const ensureBody = svc.slice(svc.indexOf("export async function ensureWorkspaceForUser"), svc.indexOf("type WorkspaceResolution"));
  assert(
    "6. ensureWorkspaceForUser solo crea tras resolución 'no_membership'",
    /if \(resolved\.kind !== "no_membership"\)\s*\{\s*return resolved\.result;/.test(ensureBody) &&
      ensureBody.indexOf("createBusinessForCurrentUser") > ensureBody.indexOf("no_membership"),
  );

  const agent = await client.query<{ enabled: boolean }>(
    `select enabled from public.ai_agent_settings where business_id = $1`,
    [PASTORE_ID],
  );
  assert("Pastore: agente IA sigue desactivado", agent.rows[0]?.enabled === false);
} finally {
  await client.end();
}

console.log(`\nRESULT passed=${passed} failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);
