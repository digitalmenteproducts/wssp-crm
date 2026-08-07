/**
 * PASO 2 piloto: crea tenant Tredici + settings vacíos + segmentos system.
 * No copia credenciales ni datos de Demo. No conecta WhatsApp.
 *
 * Uso:
 *   node scripts/seed-tredici-tenant.mjs
 *
 * Requiere SUPABASE_DB_PASSWORD en .env.local y el Auth user ya creado.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const TREDICI_USER_ID = "28b68e67-1850-41ab-acea-6e6f70b13604";
const TREDICI_EMAIL = "tredicidelivery@gmail.com";
const DESIRED_SLUG = "tredici";
const BUSINESS_NAME = "Tredici";

const DEFAULT_PROMPT =
  "Analiza la conversación de WhatsApp y extrae en JSON: producto principal, producto específico, resumen, estado comercial, motivo de no compra, intención y atributos comerciales relevantes para un restaurante.";

const SYSTEM_SEGMENTS = [
  // Semillas sprint3 + source_key (mismo mapping oficial)
  {
    name: "Pizza",
    description: "Contactos interesados en pizza",
    rules_json: {
      operator: "and",
      conditions: [{ field: "product", op: "contains", value: "pizza" }],
    },
    source_key: "system:product:pizza",
  },
  {
    name: "No compradores",
    description: "Mostraron interés pero no compraron",
    rules_json: {
      operator: "and",
      conditions: [{ field: "contact_status", op: "eq", value: "no_compro" }],
    },
    source_key: "system:status:no_compro",
  },
  {
    name: "Clientes VIP",
    description: "Clientes convertidos",
    rules_json: {
      operator: "and",
      conditions: [{ field: "contact_status", op: "eq", value: "cliente" }],
    },
    source_key: "system:status:cliente",
  },
  {
    name: "Objeción de precio",
    description: "No compraron por precio",
    rules_json: {
      operator: "or",
      conditions: [
        { field: "reason", op: "contains", value: "precio" },
        { field: "reason", op: "contains", value: "dinero" },
        { field: "reason", op: "contains", value: "plata" },
        { field: "reason", op: "contains", value: "presupuesto" },
        { field: "tag", op: "contains", value: "precio" },
        { field: "tag", op: "contains", value: "dinero" },
      ],
    },
    source_key: "system:reason:precio",
  },
  {
    name: "Activos 15 días",
    description: "Último mensaje en los últimos 15 días",
    rules_json: {
      operator: "and",
      conditions: [{ field: "last_message_within_days", op: "lte", value: 15 }],
    },
    source_key: "system:active:15d",
  },
  // Embudo (segments_origin) — se omiten No compraron/Clientes porque
  // comparten source_key con No compradores/Clientes VIP
  {
    name: "Nuevos leads",
    description: "Contactos en estado Nuevo del embudo comercial",
    rules_json: {
      operator: "and",
      conditions: [{ field: "contact_status", op: "eq", value: "nuevo" }],
    },
    source_key: "system:status:nuevo",
  },
  {
    name: "Interesados",
    description: "Contactos en estado Interesado",
    rules_json: {
      operator: "and",
      conditions: [{ field: "contact_status", op: "eq", value: "interesado" }],
    },
    source_key: "system:status:interesado",
  },
  {
    name: "No contactar",
    description: "Contactos marcados para no volver a contactar",
    rules_json: {
      operator: "and",
      conditions: [{ field: "contact_status", op: "eq", value: "no_contactar" }],
    },
    source_key: "system:status:no_contactar",
  },
  {
    name: "Activos últimos 30 días",
    description: "Último mensaje en los últimos 30 días",
    rules_json: {
      operator: "and",
      conditions: [{ field: "last_message_within_days", op: "lte", value: 30 }],
    },
    source_key: "system:active:30d",
  },
  // Silent segments
  {
    name: "No respondió más (7 días)",
    description:
      "Sin mensajes en los últimos 7 días. Útil para reactivar conversaciones frías.",
    rules_json: {
      operator: "and",
      conditions: [{ field: "last_message_within_days", op: "gte", value: 7 }],
    },
    source_key: "system:silent:7d",
  },
  {
    name: "No respondió más (15 días)",
    description: "Sin mensajes en los últimos 15 días.",
    rules_json: {
      operator: "and",
      conditions: [{ field: "last_message_within_days", op: "gte", value: 15 }],
    },
    source_key: "system:silent:15d",
  },
  {
    name: "Interesados sin respuesta (7 días)",
    description: "Estado Interesado y sin actividad reciente.",
    rules_json: {
      operator: "and",
      conditions: [
        { field: "contact_status", op: "eq", value: "interesado" },
        { field: "last_message_within_days", op: "gte", value: 7 },
      ],
    },
    source_key: "system:silent:interesado:7d",
  },
  {
    name: "No compraron sin respuesta (7 días)",
    description:
      "Estado No compró y sin actividad reciente. Buen candidato de recuperación.",
    rules_json: {
      operator: "and",
      conditions: [
        { field: "contact_status", op: "eq", value: "no_compro" },
        { field: "last_message_within_days", op: "gte", value: 7 },
      ],
    },
    source_key: "system:silent:no_compro:7d",
  },
];

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
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const password = process.env.SUPABASE_DB_PASSWORD;
if (!password) {
  console.error("FAIL=missing SUPABASE_DB_PASSWORD");
  process.exit(1);
}

const client = new pg.Client({
  host: "aws-0-us-east-2.pooler.supabase.com",
  port: 6543,
  user: "postgres.prmanzxthcznfnawhymt",
  password,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

await client.connect();

try {
  await client.query("begin");

  const authUser = await client.query(
    `select id, email from auth.users where id = $1`,
    [TREDICI_USER_ID],
  );
  if (authUser.rowCount !== 1) {
    throw new Error(`Auth user ${TREDICI_USER_ID} no existe.`);
  }
  console.log(`AUTH_OK=${authUser.rows[0].email}`);

  const existingMembership = await client.query(
    `select business_id, role from public.business_users where user_id = $1`,
    [TREDICI_USER_ID],
  );
  if (existingMembership.rowCount > 0) {
    throw new Error(
      `El user ya tiene membresía(s): ${JSON.stringify(existingMembership.rows)}`,
    );
  }

  const demoBefore = await client.query(
    `select id, name, slug, updated_at from public.businesses where slug = 'demo-2386af49'`,
  );
  const demoSettingsBefore = await client.query(
    `select business_id, whatsapp_phone_number_id, whatsapp_access_token is not null as has_token
     from public.business_settings
     where business_id = $1`,
    [demoBefore.rows[0]?.id],
  );

  let slug = DESIRED_SLUG;
  const slugTaken = await client.query(
    `select 1 from public.businesses where slug = $1`,
    [slug],
  );
  if (slugTaken.rowCount > 0) {
    slug = `tredici-${TREDICI_USER_ID.slice(0, 8)}`;
  }

  const existingTredici = await client.query(
    `select id from public.businesses where name = $1 or slug = $2`,
    [BUSINESS_NAME, DESIRED_SLUG],
  );
  if (existingTredici.rowCount > 0) {
    throw new Error(
      `Ya existe empresa Tredici/slug: ${existingTredici.rows[0].id}`,
    );
  }

  const created = await client.query(
    `insert into public.businesses (name, slug, support_email, timezone)
     values ($1, $2, $3, 'America/Caracas')
     returning id, name, slug`,
    [BUSINESS_NAME, slug, TREDICI_EMAIL],
  );
  const businessId = created.rows[0].id;
  console.log(`BUSINESS_ID=${businessId}`);
  console.log(`SLUG=${created.rows[0].slug}`);

  const membership = await client.query(
    `insert into public.business_users (business_id, user_id, role)
     values ($1, $2, 'owner')
     returning business_id, user_id, role`,
    [businessId, TREDICI_USER_ID],
  );
  console.log(
    `MEMBERSHIP=${membership.rows[0].user_id}|${membership.rows[0].role}`,
  );

  const settings = await client.query(
    `insert into public.business_settings (
       business_id,
       openai_api_key,
       whatsapp_access_token,
       whatsapp_phone_number_id,
       whatsapp_business_account_id,
       whatsapp_verify_token,
       classification_prompt,
       ai_engine_enabled
     ) values ($1, null, null, null, null, null, $2, true)
     returning business_id,
       whatsapp_access_token,
       whatsapp_phone_number_id,
       whatsapp_business_account_id,
       whatsapp_verify_token,
       openai_api_key`,
    [businessId, DEFAULT_PROMPT],
  );
  const s = settings.rows[0];
  console.log(
    `SETTINGS_EMPTY=${!s.whatsapp_access_token && !s.whatsapp_phone_number_id && !s.whatsapp_business_account_id && !s.whatsapp_verify_token && !s.openai_api_key}`,
  );

  let seeded = 0;
  for (const segment of SYSTEM_SEGMENTS) {
    const result = await client.query(
      `insert into public.segments (
         business_id, name, description, rules_json, origin, source_key
       ) values ($1, $2, $3, $4::jsonb, 'system', $5)
       on conflict (business_id, name) do nothing
       returning id`,
      [
        businessId,
        segment.name,
        segment.description,
        JSON.stringify(segment.rules_json),
        segment.source_key,
      ],
    );
    if (result.rowCount > 0) seeded += 1;
  }
  console.log(`SEGMENTS_SEEDED=${seeded}`);

  const counts = await client.query(
    `select
       (select count(*)::int from public.contacts where business_id = $1) as contacts,
       (select count(*)::int from public.templates where business_id = $1) as templates,
       (select count(*)::int from public.campaigns where business_id = $1) as campaigns,
       (select count(*)::int from public.segments where business_id = $1) as segments,
       (select count(*)::int from public.messages where business_id = $1) as messages`,
    [businessId],
  );
  console.log(`COUNTS=${JSON.stringify(counts.rows[0])}`);

  const demoAfter = await client.query(
    `select id, name, slug, updated_at from public.businesses where id = $1`,
    [demoBefore.rows[0]?.id],
  );
  const demoSettingsAfter = await client.query(
    `select business_id, whatsapp_phone_number_id, whatsapp_access_token is not null as has_token
     from public.business_settings where business_id = $1`,
    [demoBefore.rows[0]?.id],
  );

  const demoUntouched =
    demoBefore.rows[0]?.updated_at?.toISOString?.() ===
      demoAfter.rows[0]?.updated_at?.toISOString?.() &&
    demoSettingsBefore.rows[0]?.whatsapp_phone_number_id ===
      demoSettingsAfter.rows[0]?.whatsapp_phone_number_id &&
    demoSettingsBefore.rows[0]?.has_token ===
      demoSettingsAfter.rows[0]?.has_token;
  console.log(`DEMO_UNTOUCHED=${demoUntouched}`);
  console.log(`DEMO_ID=${demoBefore.rows[0]?.id}`);

  const cross = await client.query(
    `select count(*)::int as c
     from public.business_users
     where user_id = $1 and business_id <> $2`,
    [TREDICI_USER_ID, businessId],
  );
  console.log(`CROSS_MEMBERSHIPS=${cross.rows[0].c}`);

  await client.query("commit");
  console.log("OK");
} catch (error) {
  await client.query("rollback");
  console.error(
    "FAIL=" + (error instanceof Error ? error.message : String(error)),
  );
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
