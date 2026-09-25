/**
 * One-shot: crea Auth user + tenant CLINICA PASTORE.
 * No conecta WhatsApp. No activa Agente IA. No toca Demo ni Tredici.
 *
 * Credenciales vía env (no hardcodear en repo):
 *   CLINICA_PASTORE_EMAIL
 *   CLINICA_PASTORE_PASSWORD
 *
 * Uso:
 *   node scripts/seed-clinica-pastore-tenant.mjs
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const BUSINESS_NAME = "CLINICA PASTORE";
const DESIRED_SLUG = "clinica-pastore";
const DEMO_SLUG = "demo-2386af49";
const TREDICI_SLUG = "tredici";

const DEFAULT_PROMPT =
  "Analiza la conversación de WhatsApp y extrae en JSON: producto principal, producto específico, resumen, estado comercial, motivo de no compra, intención y atributos comerciales relevantes para un restaurante.";

const SYSTEM_SEGMENTS = [
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

const email = process.env.CLINICA_PASTORE_EMAIL?.trim().toLowerCase();
const password = process.env.CLINICA_PASTORE_PASSWORD;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbPassword = process.env.SUPABASE_DB_PASSWORD;

if (!email || !password) {
  console.error("FAIL=missing CLINICA_PASTORE_EMAIL or CLINICA_PASTORE_PASSWORD");
  process.exit(1);
}
if (!supabaseUrl || !serviceRole) {
  console.error("FAIL=missing Supabase URL or SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!dbPassword && !process.env.DATABASE_URL) {
  console.error("FAIL=missing DATABASE_URL or SUPABASE_DB_PASSWORD");
  process.exit(1);
}

async function ensureAuthUser() {
  const listUrl = new URL("/auth/v1/admin/users", supabaseUrl);
  listUrl.searchParams.set("page", "1");
  listUrl.searchParams.set("per_page", "200");

  const listed = await fetch(listUrl, {
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
    },
  });
  const listedJson = await listed.json();
  if (!listed.ok) {
    throw new Error(
      `No se pudo listar users: ${listedJson.message ?? listed.status}`,
    );
  }

  const existing = (listedJson.users ?? []).find(
    (u) => (u.email ?? "").toLowerCase() === email,
  );
  if (existing) {
    console.log(`AUTH_EXISTING=${existing.id}`);
    return existing.id;
  }

  const created = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: BUSINESS_NAME },
    }),
  });
  const createdJson = await created.json();
  if (!created.ok || !createdJson.id) {
    throw new Error(
      `No se pudo crear Auth user: ${
        createdJson.msg ??
        createdJson.message ??
        createdJson.error ??
        created.status
      }`,
    );
  }
  console.log(`AUTH_CREATED=${createdJson.id}`);
  return createdJson.id;
}

function snapshotBusiness(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    updated_at:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

const userId = await ensureAuthUser();

const client = process.env.DATABASE_URL
  ? new pg.Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : new pg.Client({
      host: "aws-0-us-east-2.pooler.supabase.com",
      port: 6543,
      user: "postgres.prmanzxthcznfnawhymt",
      password: dbPassword,
      database: "postgres",
      ssl: { rejectUnauthorized: false },
    });

await client.connect();

try {
  await client.query("begin");

  const authUser = await client.query(
    `select id, email from auth.users where id = $1`,
    [userId],
  );
  if (authUser.rowCount !== 1) {
    throw new Error(`Auth user ${userId} no visible en DB.`);
  }
  console.log(`AUTH_OK=${authUser.rows[0].email}`);

  const existingMembership = await client.query(
    `select business_id, role from public.business_users where user_id = $1`,
    [userId],
  );
  if (existingMembership.rowCount > 0) {
    throw new Error(
      `El user ya tiene membresía(s): ${JSON.stringify(existingMembership.rows)}`,
    );
  }

  const demoBefore = await client.query(
    `select id, name, slug, updated_at from public.businesses where slug = $1`,
    [DEMO_SLUG],
  );
  const trediciBefore = await client.query(
    `select id, name, slug, updated_at from public.businesses where slug = $1 or name = 'Tredici' order by created_at asc limit 1`,
    [TREDICI_SLUG],
  );

  if (demoBefore.rowCount !== 1) {
    throw new Error("Demo no encontrada; abortando por seguridad.");
  }
  if (trediciBefore.rowCount !== 1) {
    throw new Error("Tredici no encontrada; abortando por seguridad.");
  }

  const demoSettingsBefore = await client.query(
    `select business_id, whatsapp_phone_number_id,
            whatsapp_access_token is not null as has_token,
            whatsapp_connection_status
     from public.business_settings where business_id = $1`,
    [demoBefore.rows[0].id],
  );
  const trediciSettingsBefore = await client.query(
    `select business_id, whatsapp_phone_number_id,
            whatsapp_access_token is not null as has_token,
            whatsapp_connection_status
     from public.business_settings where business_id = $1`,
    [trediciBefore.rows[0].id],
  );
  const demoSegBefore = await client.query(
    `select count(*)::int as c from public.segments where business_id = $1`,
    [demoBefore.rows[0].id],
  );
  const trediciSegBefore = await client.query(
    `select count(*)::int as c from public.segments where business_id = $1`,
    [trediciBefore.rows[0].id],
  );

  console.log(`DEMO_BEFORE=${JSON.stringify(snapshotBusiness(demoBefore.rows[0]))}`);
  console.log(
    `TREDICI_BEFORE=${JSON.stringify(snapshotBusiness(trediciBefore.rows[0]))}`,
  );

  const existingBusiness = await client.query(
    `select id, name, slug from public.businesses
     where name = $1 or slug = $2 or slug like $3`,
    [BUSINESS_NAME, DESIRED_SLUG, `${DESIRED_SLUG}%`],
  );
  if (existingBusiness.rowCount > 0) {
    throw new Error(
      `Ya existe CLINICA PASTORE / slug: ${JSON.stringify(existingBusiness.rows)}`,
    );
  }

  let slug = DESIRED_SLUG;
  const slugTaken = await client.query(
    `select 1 from public.businesses where slug = $1`,
    [slug],
  );
  if (slugTaken.rowCount > 0) {
    slug = `${DESIRED_SLUG}-${userId.slice(0, 8)}`;
  }

  const created = await client.query(
    `insert into public.businesses (name, slug, support_email, timezone)
     values ($1, $2, $3, 'America/Caracas')
     returning id, name, slug`,
    [BUSINESS_NAME, slug, email],
  );
  const businessId = created.rows[0].id;
  console.log(`BUSINESS_ID=${businessId}`);
  console.log(`SLUG=${created.rows[0].slug}`);

  const membership = await client.query(
    `insert into public.business_users (business_id, user_id, role)
     values ($1, $2, 'owner')
     returning business_id, user_id, role`,
    [businessId, userId],
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
       ai_engine_enabled,
       whatsapp_connection_status
     ) values ($1, null, null, null, null, null, $2, false, 'disconnected')
     returning business_id,
       whatsapp_access_token,
       whatsapp_phone_number_id,
       whatsapp_business_account_id,
       whatsapp_verify_token,
       openai_api_key,
       ai_engine_enabled,
       whatsapp_connection_status`,
    [businessId, DEFAULT_PROMPT],
  );
  const s = settings.rows[0];
  const settingsEmpty =
    !s.whatsapp_access_token &&
    !s.whatsapp_phone_number_id &&
    !s.whatsapp_business_account_id &&
    !s.whatsapp_verify_token &&
    !s.openai_api_key;
  console.log(`SETTINGS_EMPTY=${settingsEmpty}`);
  console.log(`AI_ENGINE_ENABLED=${s.ai_engine_enabled}`);

  const agent = await client.query(
    `insert into public.ai_agent_settings (
       business_id,
       enabled,
       agent_name,
       business_name,
       business_description,
       system_instructions,
       tone,
       custom_tone_instructions,
       language,
       response_length,
       human_handoff_enabled,
       human_handoff_instructions
     ) values (
       $1, false, 'Asistente', $2, '', '', 'profesional', '', 'auto', 'breve', true, ''
     )
     on conflict (business_id) do nothing
     returning business_id, enabled, system_instructions`,
    [businessId, BUSINESS_NAME],
  );
  if (agent.rowCount === 0) {
    const existingAgent = await client.query(
      `select business_id, enabled, system_instructions
       from public.ai_agent_settings where business_id = $1`,
      [businessId],
    );
    console.log(`AI_AGENT=${JSON.stringify(existingAgent.rows[0])}`);
  } else {
    console.log(`AI_AGENT=${JSON.stringify(agent.rows[0])}`);
  }

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
    if (result.rowCount && result.rowCount > 0) seeded += 1;
  }
  console.log(`SEGMENTS_SEEDED=${seeded}`);

  const counts = await client.query(
    `select
       (select count(*)::int from public.contacts where business_id = $1) as contacts,
       (select count(*)::int from public.conversations where business_id = $1) as conversations,
       (select count(*)::int from public.messages where business_id = $1) as messages,
       (select count(*)::int from public.templates where business_id = $1) as templates,
       (select count(*)::int from public.campaigns where business_id = $1) as campaigns,
       (select count(*)::int from public.segments where business_id = $1) as segments,
       (select count(*)::int from public.segments where business_id = $1 and origin = 'system') as system_segments,
       (select count(*)::int from public.segments where business_id = $1 and origin <> 'system') as manual_segments,
       (select count(*)::int from public.ai_knowledge_entries where business_id = $1) as knowledge,
       (select enabled from public.ai_agent_settings where business_id = $1) as agent_enabled`,
    [businessId],
  );
  console.log(`COUNTS=${JSON.stringify(counts.rows[0])}`);

  const crossMembership = await client.query(
    `select count(*)::int as c
     from public.business_users
     where user_id = $1 and business_id <> $2`,
    [userId, businessId],
  );
  const isolationOk =
    crossMembership.rows[0].c === 0 &&
    counts.rows[0].contacts === 0 &&
    counts.rows[0].conversations === 0 &&
    counts.rows[0].messages === 0 &&
    counts.rows[0].templates === 0 &&
    counts.rows[0].campaigns === 0 &&
    counts.rows[0].manual_segments === 0 &&
    counts.rows[0].agent_enabled === false &&
    counts.rows[0].knowledge === 0 &&
    settingsEmpty;
  console.log(`ISOLATION_OK=${isolationOk}`);
  console.log(`CROSS_MEMBERSHIPS=${crossMembership.rows[0].c}`);

  const demoAfter = await client.query(
    `select id, name, slug, updated_at from public.businesses where id = $1`,
    [demoBefore.rows[0].id],
  );
  const trediciAfter = await client.query(
    `select id, name, slug, updated_at from public.businesses where id = $1`,
    [trediciBefore.rows[0].id],
  );
  const demoSettingsAfter = await client.query(
    `select business_id, whatsapp_phone_number_id,
            whatsapp_access_token is not null as has_token,
            whatsapp_connection_status
     from public.business_settings where business_id = $1`,
    [demoBefore.rows[0].id],
  );
  const trediciSettingsAfter = await client.query(
    `select business_id, whatsapp_phone_number_id,
            whatsapp_access_token is not null as has_token,
            whatsapp_connection_status
     from public.business_settings where business_id = $1`,
    [trediciBefore.rows[0].id],
  );
  const demoSegAfter = await client.query(
    `select count(*)::int as c from public.segments where business_id = $1`,
    [demoBefore.rows[0].id],
  );
  const trediciSegAfter = await client.query(
    `select count(*)::int as c from public.segments where business_id = $1`,
    [trediciBefore.rows[0].id],
  );

  const demoUntouched =
    snapshotBusiness(demoBefore.rows[0]).updated_at ===
      snapshotBusiness(demoAfter.rows[0]).updated_at &&
    demoSettingsBefore.rows[0]?.whatsapp_phone_number_id ===
      demoSettingsAfter.rows[0]?.whatsapp_phone_number_id &&
    demoSettingsBefore.rows[0]?.has_token ===
      demoSettingsAfter.rows[0]?.has_token &&
    demoSettingsBefore.rows[0]?.whatsapp_connection_status ===
      demoSettingsAfter.rows[0]?.whatsapp_connection_status &&
    demoSegBefore.rows[0].c === demoSegAfter.rows[0].c;

  const trediciUntouched =
    snapshotBusiness(trediciBefore.rows[0]).updated_at ===
      snapshotBusiness(trediciAfter.rows[0]).updated_at &&
    trediciSettingsBefore.rows[0]?.whatsapp_phone_number_id ===
      trediciSettingsAfter.rows[0]?.whatsapp_phone_number_id &&
    trediciSettingsBefore.rows[0]?.has_token ===
      trediciSettingsAfter.rows[0]?.has_token &&
    trediciSettingsBefore.rows[0]?.whatsapp_connection_status ===
      trediciSettingsAfter.rows[0]?.whatsapp_connection_status &&
    trediciSegBefore.rows[0].c === trediciSegAfter.rows[0].c;

  console.log(`DEMO_UNTOUCHED=${demoUntouched}`);
  console.log(`TREDICI_UNTOUCHED=${trediciUntouched}`);
  console.log(`DEMO_ID=${demoBefore.rows[0].id}`);
  console.log(`TREDICI_ID=${trediciBefore.rows[0].id}`);

  if (!isolationOk || !demoUntouched || !trediciUntouched) {
    throw new Error(
      "Validación falló (aislamiento o tenants existentes alterados). Rollback.",
    );
  }

  await client.query("commit");
  console.log("OK");
  console.log(`LOGIN_EMAIL=${email}`);
  console.log(`USER_ID=${userId}`);
  console.log(`BUSINESS=${BUSINESS_NAME}`);
} catch (error) {
  await client.query("rollback");
  console.error(
    "FAIL=" + (error instanceof Error ? error.message : String(error)),
  );
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
