/**
 * Configura instrucciones del Agente IA SOLO para CLINICA PASTORE.
 * Mantiene enabled=false. No toca WhatsApp ni otras empresas.
 *
 * Uso: node scripts/configure-clinica-pastore-ai-agent.mjs
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const BUSINESS_ID = "ee05dfbd-839b-4f52-be6f-327080995e56";
const DEMO_ID = "725a07bb-62e0-40bc-bed4-54191d667ae4";
const TREDICI_ID = "2f67b2b0-f5ee-4578-a440-d453f325dbdb";

const SYSTEM_INSTRUCTIONS = `Eres el asistente administrativo y comercial de CLINICA PASTORE.

Tu rol es ayudar con información administrativa, orientación sobre servicios y solicitud de citas. NO eres médico ni personal clínico.

PUEDES:
- Informar sobre servicios disponibles (solo si están en la base de conocimiento).
- Informar horarios, ubicación, precios y formas de pago (solo si están en la base de conocimiento).
- Explicar cómo solicitar una cita.
- Responder preguntas administrativas frecuentes.
- Ayudar a identificar qué servicio desea consultar el usuario.
- Transferir la conversación a un humano cuando corresponda.

NO PUEDES:
- Diagnosticar enfermedades.
- Recomendar medicamentos.
- Modificar tratamientos.
- Interpretar estudios médicos.
- Proporcionar instrucciones médicas personalizadas.
- Inventar precios, disponibilidad, horarios o servicios. Si no está en la base de conocimiento, dilo con claridad y ofrece transferir a un humano.

Si una pregunta requiere criterio médico, indica que debe atenderla un profesional de la clínica y ofrece transferir la conversación.

Si el usuario solicita hablar con una persona, activa handoff de inmediato.`;

const HANDOFF_INSTRUCTIONS = `Activa handoff de inmediato si el usuario pide hablar con una persona, un humano, un asesor o personal de la clínica.

También transfiere si la consulta requiere criterio médico (diagnóstico, medicamentos, tratamientos, interpretación de estudios o instrucciones médicas personalizadas), o si falta información crítica que no está en la base de conocimiento.`;

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

const client = process.env.DATABASE_URL
  ? new pg.Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : new pg.Client({
      host: "aws-0-us-east-2.pooler.supabase.com",
      port: 6543,
      user: "postgres.prmanzxthcznfnawhymt",
      password: process.env.SUPABASE_DB_PASSWORD,
      database: "postgres",
      ssl: { rejectUnauthorized: false },
    });

await client.connect();

try {
  await client.query("begin");

  const biz = await client.query(
    `select id, name, slug from public.businesses where id = $1`,
    [BUSINESS_ID],
  );
  if (biz.rowCount !== 1 || biz.rows[0].slug !== "clinica-pastore") {
    throw new Error("CLINICA PASTORE no coincide; abortando.");
  }

  const demoBefore = await client.query(
    `select business_id, enabled, left(system_instructions, 40) as si_prefix, updated_at
     from public.ai_agent_settings where business_id = $1`,
    [DEMO_ID],
  );
  const trediciBefore = await client.query(
    `select business_id, enabled, left(system_instructions, 40) as si_prefix, updated_at
     from public.ai_agent_settings where business_id = $1`,
    [TREDICI_ID],
  );

  const updated = await client.query(
    `update public.ai_agent_settings
     set
       enabled = false,
       agent_name = 'Asistente administrativo',
       business_name = 'CLINICA PASTORE',
       business_description = 'Clínica de estética. Asistente administrativo y comercial (no médico).',
       system_instructions = $2,
       tone = 'profesional',
       language = 'es',
       response_length = 'normal',
       human_handoff_enabled = true,
       human_handoff_instructions = $3,
       updated_at = now()
     where business_id = $1
     returning business_id, enabled, agent_name, length(system_instructions) as instructions_len,
               human_handoff_enabled, left(system_instructions, 80) as preview`,
    [BUSINESS_ID, SYSTEM_INSTRUCTIONS, HANDOFF_INSTRUCTIONS],
  );

  if (updated.rowCount !== 1) {
    throw new Error("No se actualizó exactamente 1 fila de ai_agent_settings.");
  }

  const knowledge = await client.query(
    `select count(*)::int as c from public.ai_knowledge_entries where business_id = $1`,
    [BUSINESS_ID],
  );

  const wa = await client.query(
    `select whatsapp_access_token is not null as has_token,
            whatsapp_phone_number_id,
            whatsapp_connection_status
     from public.business_settings where business_id = $1`,
    [BUSINESS_ID],
  );

  const demoAfter = await client.query(
    `select business_id, enabled, left(system_instructions, 40) as si_prefix, updated_at
     from public.ai_agent_settings where business_id = $1`,
    [DEMO_ID],
  );
  const trediciAfter = await client.query(
    `select business_id, enabled, left(system_instructions, 40) as si_prefix, updated_at
     from public.ai_agent_settings where business_id = $1`,
    [TREDICI_ID],
  );

  const demoUntouched =
    JSON.stringify(demoBefore.rows[0] ?? null) ===
    JSON.stringify(demoAfter.rows[0] ?? null);
  const trediciUntouched =
    JSON.stringify(trediciBefore.rows[0] ?? null) ===
    JSON.stringify(trediciAfter.rows[0] ?? null);

  console.log(`BUSINESS=${biz.rows[0].name}|${biz.rows[0].slug}`);
  console.log(`AI_UPDATED=${JSON.stringify(updated.rows[0])}`);
  console.log(`KNOWLEDGE_COUNT=${knowledge.rows[0].c}`);
  console.log(`WHATSAPP=${JSON.stringify(wa.rows[0])}`);
  console.log(`DEMO_UNTOUCHED=${demoUntouched}`);
  console.log(`TREDICI_UNTOUCHED=${trediciUntouched}`);

  if (
    updated.rows[0].enabled !== false ||
    wa.rows[0].has_token ||
    wa.rows[0].whatsapp_phone_number_id ||
    !demoUntouched ||
    !trediciUntouched
  ) {
    throw new Error("Validación falló; rollback.");
  }

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
