/**
 * Tests del visor de Conversaciones (solo lectura).
 * Uso: npx tsx scripts/test-conversations.mts
 *      BASE_URL=http://localhost:3000 npx tsx scripts/test-conversations.mts  (añade CASO E por HTTP)
 *
 * - Roles simulados con request.jwt.claims + role authenticated en transacciones ROLLBACK.
 * - Nunca imprime contenido de mensajes, teléfonos ni emails (solo PASS/FAIL y conteos).
 * - No envía WhatsApp, no escribe en conversations/messages/contacts, no activa agentes.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

import {
  CONVERSATION_MESSAGES_LIMIT,
  CONVERSATIONS_LIST_LIMIT,
  formatDayLabel,
  formatListTimestamp,
  formatMessageTime,
  isAiMessage,
  isSimulationMessage,
  messageDayKey,
  messageDisplayText,
  messagePreview,
} from "../src/lib/conversations";

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
assert("IA: saliente text → IA", isAiMessage("outbound", "text"));
assert("IA: saliente template (campaña) → no IA", !isAiMessage("outbound", "template"));
assert("IA: entrante → nunca IA", !isAiMessage("inbound", "text"));
assert("simulación: harness true → sí", isSimulationMessage(true));
assert("simulación: null/undefined → no", !isSimulationMessage(null) && !isSimulationMessage(undefined));
assert("texto: body vacío de imagen → 'Imagen'", messageDisplayText(null, "image") === "Imagen");
assert("texto: tipo desconocido → etiqueta genérica", messageDisplayText("  ", "foo") === "Mensaje (foo)");
assert("preview: recorta a 80 con …", messagePreview("x".repeat(200), "text").length === 80);
assert("preview: sin mensajes", messagePreview(null, null) === "Sin mensajes");
assert("preview: colapsa saltos de línea", messagePreview("hola\n\nque tal", "text") === "hola que tal");
const TZ = "America/Argentina/Tucuman";
assert("hora: 14:05 en zona del negocio", formatMessageTime("2026-09-15T17:05:00Z", TZ) === "14:05");
assert("día: clave respeta zona (UTC 02:00 → día anterior)", messageDayKey("2026-09-16T02:00:00Z", TZ) === "2026-09-15");
assert("día: etiqueta '15 sep 2026'", formatDayLabel("2026-09-15T15:00:00Z", TZ) === "15 sep 2026");
const now = new Date("2026-10-01T18:00:00Z");
assert("lista: hoy → hora", formatListTimestamp("2026-10-01T13:30:00Z", TZ, now) === "10:30");
assert("lista: este año → '15 sep'", formatListTimestamp("2026-09-15T15:00:00Z", TZ, now) === "15 sep");
assert("lista: otro año → '15 sep 2025'", formatListTimestamp("2025-09-15T15:00:00Z", TZ, now) === "15 sep 2025");
assert("lista: null → vacío", formatListTimestamp(null, TZ, now) === "");
assert("límites razonables (50 conversaciones / 200 mensajes)", CONVERSATIONS_LIST_LIMIT === 50 && CONVERSATION_MESSAGES_LIMIT === 200);

// ---------------------------------------------------------------------------
// Estático: solo lectura, negocio activo centralizado, sin secretos
// ---------------------------------------------------------------------------
const read = (...p: string[]) => fs.readFileSync(path.join(...p), "utf8");
const page = read("src", "app", "(dashboard)", "conversaciones", "page.tsx");
const svc = read("src", "services", "conversations", "conversations.service.ts");
const repo = read("src", "repositories", "conversations.repository.ts");
const list = read("src", "components", "conversations", "conversation-list.tsx");
const chat = read("src", "components", "conversations", "conversation-chat.tsx");
const types = read("src", "types", "conversations.ts");
const moduleFiles = [page, svc, repo, list, chat, types];
const config = read("src", "config", "app.ts");
const sidebar = read("src", "components", "layout", "app-sidebar.tsx");

assert("servicio: usa resolveCurrentWorkspace()", svc.includes("businessService.resolveCurrentWorkspace()"));
assert("servicio: business_id solo del workspace", /business\.id/.test(svc) && !/searchParams/.test(svc));
assert("servicio: valida conversation id con Zod uuid", svc.includes("conversationIdSchema.safeParse"));
assert("página: solo lee ?c (conversation id), nunca business_id", !/business_id|businessId/.test(page) && /params\.c/.test(page));
assert("repositorio: cliente de sesión, sin admin", repo.includes("await createClient()") && !repo.includes("createAdminClient"));
assert(
  "repositorio: todas las consultas filtran por business_id",
  (repo.match(/\.from\(/g) ?? []).length === (repo.match(/\.eq\("business_id"/g) ?? []).length,
);
assert(
  "solo lectura: sin insert/update/upsert/delete/rpc",
  moduleFiles.every((f) => !/\.(insert|update|upsert|delete|rpc)\(/.test(f)),
);
assert(
  "solo lectura: sin envío WhatsApp/Meta/OpenAI ni fetch",
  moduleFiles.every((f) => !/sendWhatsApp|graph\.facebook|openai|fetch\(/i.test(f)),
);
assert(
  "solo lectura: sin caja de respuesta ni botón enviar",
  moduleFiles.every((f) => !/<textarea|<input|<form|<Button|type="submit"|onClick|formAction|"use server"/.test(f)),
);
assert("solo lectura: componentes sin 'use client'", moduleFiles.every((f) => !/^\s*["']use client["']/m.test(f)));
assert("sin marcar leídos / pausar IA", moduleFiles.every((f) => !/agent_paused|read_at|mark.*read/i.test(f)));
{
  const selects = (repo.match(/\.select\(\s*(`[^`]*`|"[^"]*")/g) ?? []).join("\n");
  assert(
    "mensajes: raw_payload no se selecciona completo (solo marca harness)",
    selects.includes("harness:raw_payload->harness") &&
      !/raw_payload/.test(selects.replace(/harness:raw_payload->harness/g, "")) &&
      !/\*/.test(selects),
  );
}
assert(
  "CASO F: módulo no referencia secretos/tokens",
  moduleFiles.every((f) => !/business_secrets|access_token|verify_token|app_secret|SERVICE_ROLE|whatsapp_.*token/i.test(f)),
);
assert(
  "CASO F: tipos expuestos sin campos sensibles",
  !/token|secret|raw_payload|agent_metadata|business_id/.test(types),
);
assert("menú: entrada Conversaciones → /conversaciones", config.includes(`conversaciones: "/conversaciones"`) && sidebar.includes("ROUTES.conversaciones") && sidebar.includes(`"Conversaciones"`));
assert("CASO E: /conversaciones en PROTECTED_PREFIXES", /PROTECTED_PREFIXES = \[[\s\S]*ROUTES\.conversaciones[\s\S]*\]/.test(config));
assert("estados vacíos con textos pedidos", list.includes("No hay conversaciones todavía.") && page.includes("Selecciona una conversación para ver los mensajes."));

// ---------------------------------------------------------------------------
// DB (RLS) — mismas consultas que el repositorio, como usuarios simulados
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

async function listConvs(businessId: string) {
  const r = await client.query(
    `select c.id from public.conversations c where c.business_id = $1
     order by c.last_message_at desc nulls last limit ${CONVERSATIONS_LIST_LIMIT}`,
    [businessId],
  );
  return r.rows.map((x) => String(x.id));
}

async function listMsgs(businessId: string, conversationId: string) {
  const r = await client.query(
    `select id from public.messages where business_id = $1 and conversation_id = $2
     order by created_at desc limit ${CONVERSATION_MESSAGES_LIMIT}`,
    [businessId, conversationId],
  );
  return r.rowCount ?? 0;
}

async function snapshot() {
  const r = await client.query(
    `select
       (select count(*)::int from public.conversations) as convs,
       (select max(updated_at)::text from public.conversations) as convs_updated,
       (select count(*)::int from public.messages) as msgs,
       (select count(*)::int from public.contacts) as contacts,
       (select max(updated_at)::text from public.contacts) as contacts_updated,
       (select count(*)::int from public.business_users where business_id = $1) as pastore_members,
       (select count(*)::int from public.clinic_appointments where business_id = $1) as appointments,
       (select max(updated_at)::text from public.clinic_appointments where business_id = $1) as appt_updated,
       (select count(*)::int from public.clinic_appointments where id = $2) as protected_appt,
       (select enabled from public.ai_agent_settings where business_id = $1) as agent_enabled`,
    [PASTORE_ID, PROTECTED_APPT],
  );
  return r.rows[0] as Record<string, unknown>;
}

try {
  const before = await snapshot();

  const owners = await client.query<{ user_id: string; business_id: string }>(
    `select bu.user_id, bu.business_id from public.business_users bu
     where bu.role = 'owner'
       and exists (select 1 from public.conversations c where c.business_id = bu.business_id)
     order by (bu.business_id = $1) desc limit 2`,
    [PASTORE_ID],
  );
  const a = owners.rows.find((r) => r.business_id === PASTORE_ID);
  const b = owners.rows.find((r) => r.business_id !== PASTORE_ID);
  assert("setup: Pastore (A) y otro negocio con conversaciones (B)", Boolean(a && b));

  const policies = await client.query<{ tablename: string; cmd: string; qual: string | null }>(
    `select tablename, cmd, qual from pg_policies where schemaname='public' and tablename in ('conversations','messages')`,
  );
  assert(
    "RLS intacta: conversations/messages solo SELECT is_business_member",
    policies.rows.length === 2 && policies.rows.every((p) => p.cmd === "SELECT" && /is_business_member\(business_id\)/.test(p.qual ?? "")),
  );

  if (a && b) {
    const totalA = await client.query(`select count(*)::int n from public.conversations where business_id = $1`, [a.business_id]);
    const convB = await client.query<{ id: string }>(`select id from public.conversations where business_id = $1 limit 1`, [b.business_id]);
    const convBId = convB.rows[0].id;
    const msgsB = await client.query(`select count(*)::int n from public.messages where conversation_id = $1`, [convBId]);

    // CASO A
    await inTx(async () => {
      await setUser(a.user_id);
      const ids = await listConvs(a.business_id);
      assert("CASO A: owner ve las conversaciones de su negocio", ids.length === Math.min(totalA.rows[0].n, CONVERSATIONS_LIST_LIMIT) && ids.length > 0);
      const n = await listMsgs(a.business_id, ids[0]);
      assert("CASO A: owner ve mensajes de su conversación", n > 0);
    });

    // CASO B: admin temporal
    await inTx(async () => {
      await client.query(`insert into public.business_users (business_id, user_id, role) values ($1, $2, 'admin')`, [a.business_id, b.user_id]);
      await setUser(b.user_id);
      const ids = await listConvs(a.business_id);
      assert("CASO B: admin ve las conversaciones del negocio", ids.length === Math.min(totalA.rows[0].n, CONVERSATIONS_LIST_LIMIT));
      assert("CASO B: admin ve mensajes", (await listMsgs(a.business_id, ids[0])) > 0);
    });

    // Documentación: member (comportamiento actual por RLS)
    await inTx(async () => {
      await client.query(`insert into public.business_users (business_id, user_id, role) values ($1, $2, 'member')`, [a.business_id, b.user_id]);
      await setUser(b.user_id);
      const ids = await listConvs(a.business_id);
      assert("DOC: member también puede leer (RLS is_business_member, sin cambios)", ids.length > 0);
    });

    // CASO C: A no obtiene conversaciones de B
    await inTx(async () => {
      await setUser(a.user_id);
      assert("CASO C: owner de A consultando business_id de B → 0", (await listConvs(b.business_id)).length === 0);
      const any = await client.query(`select count(*)::int n from public.conversations where business_id <> $1`, [a.business_id]);
      assert("CASO C: sin filtro, RLS no devuelve conversaciones ajenas", any.rows[0].n === 0);
    });
    await inTx(async () => {
      await setUser(b.user_id);
      assert("CASO C: owner de B consultando A → 0", (await listConvs(a.business_id)).length === 0);
    });

    // CASO D: conversation id de otro negocio
    assert("setup D: la conversación de B tiene mensajes", msgsB.rows[0].n > 0);
    await inTx(async () => {
      await setUser(a.user_id);
      const header = await client.query(`select id from public.conversations where business_id = $1 and id = $2`, [a.business_id, convBId]);
      assert("CASO D: conversación de B con negocio activo A → no encontrada", header.rowCount === 0);
      assert("CASO D: mensajes de B con negocio activo A → 0", (await listMsgs(a.business_id, convBId)) === 0);
      assert("CASO D: aun forzando business_id de B → 0 (RLS)", (await listMsgs(b.business_id, convBId)) === 0);
    });

    // Anónimo
    await inTx(async () => {
      await setUser(null);
      const r = await client.query(`select count(*)::int n from public.messages`).catch(() => ({ rows: [{ n: 0 }] }));
      assert("anon: 0 mensajes vía SQL", r.rows[0].n === 0);
    });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (url && key) {
      for (const table of ["conversations", "messages", "business_secrets"]) {
        const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=5`, {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
        });
        const body = await res.text();
        assert(`CASO F: REST anon /${table} sin filas`, !res.ok || body.trim() === "[]", `status=${res.status}`);
      }
    }

    // Forma de la consulta de la lista (embed limitado a 1 mensaje, el más reciente). Solo lectura.
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && serviceKey) {
      const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
      const { data, error } = await admin
        .from("conversations")
        .select("id, last_message_at, contact:contacts ( name, phone ), last_message:messages ( body, type, direction, created_at )")
        .eq("business_id", a.business_id)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("created_at", { referencedTable: "last_message", ascending: false })
        .limit(1, { referencedTable: "last_message" })
        .limit(CONVERSATIONS_LIST_LIMIT);
      assert("lista: consulta PostgREST válida", !error, error?.message);
      const rows = (data ?? []) as unknown as Array<{ id: string; last_message: Array<{ created_at: string }> | null; contact: unknown }>;
      assert("lista: 1 último mensaje por conversación", rows.length > 0 && rows.every((r) => (r.last_message?.length ?? 0) <= 1));
      const maxes = await client.query<{ conversation_id: string; max: string }>(
        `select conversation_id, max(created_at) as max from public.messages where business_id = $1 group by 1`,
        [a.business_id],
      );
      const ok = rows.every((r) => {
        const expected = maxes.rows.find((m) => m.conversation_id === r.id);
        if (!expected) return !r.last_message?.length;
        return new Date(r.last_message![0].created_at).getTime() === new Date(expected.max).getTime();
      });
      assert("lista: el mensaje embebido es el más reciente", ok);
      assert("lista: contacto embebido como objeto", rows.every((r) => r.contact !== null && !Array.isArray(r.contact)));

      const msgs = await admin
        .from("messages")
        .select("id, direction, type, body, created_at, harness:raw_payload->harness")
        .eq("business_id", a.business_id)
        .eq("conversation_id", rows[0].id)
        .order("created_at", { ascending: false })
        .limit(CONVERSATION_MESSAGES_LIMIT);
      assert("mensajes: consulta PostgREST válida", !msgs.error, msgs.error?.message);
      const keys = Object.keys((msgs.data ?? [])[0] ?? {}).sort().join(",");
      assert("mensajes: solo columnas de visualización", keys === "body,created_at,direction,harness,id,type", keys);
    }
  }

  // CASO E por HTTP (opcional)
  const baseUrl = process.env.BASE_URL;
  if (baseUrl) {
    const res = await fetch(`${baseUrl}/conversaciones`, { redirect: "manual" });
    const location = res.headers.get("location") ?? "";
    assert("CASO E: sin sesión /conversaciones → redirect a /login", (res.status === 307 || res.status === 302) && location.includes("/login"), `status=${res.status}`);
    const res2 = await fetch(`${baseUrl}/conversaciones?c=00000000-0000-4000-8000-000000000000`, { redirect: "manual" });
    assert("CASO E: sin sesión con ?c= → redirect", res2.status === 307 || res2.status === 302);
  } else {
    console.log("SKIP CASO E HTTP (define BASE_URL)");
  }

  const after = await snapshot();
  assert("sin escrituras: conversations idénticas", after.convs === before.convs && after.convs_updated === before.convs_updated);
  assert("sin escrituras: messages idénticos", after.msgs === before.msgs);
  assert("sin escrituras: contacts idénticos", after.contacts === before.contacts && after.contacts_updated === before.contacts_updated);
  assert("Pastore: memberships idénticas", after.pastore_members === before.pastore_members);
  assert("Pastore: citas intactas", after.appointments === before.appointments && after.appt_updated === before.appt_updated);
  assert("Pastore: cita protegida sigue existiendo", after.protected_appt === 1);
  assert("Pastore: agente sigue desactivado", after.agent_enabled === false);
} finally {
  await client.end();
}

console.log(`\nRESULT passed=${passed} failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);
