/**
 * Carga knowledge base inicial SOLO para CLINICA PASTORE.
 * No activa Agente IA. No conecta WhatsApp. No toca otras empresas.
 *
 * Uso: node scripts/seed-clinica-pastore-knowledge.mjs
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const BUSINESS_ID = "ee05dfbd-839b-4f52-be6f-327080995e56";
const DEMO_ID = "725a07bb-62e0-40bc-bed4-54191d667ae4";
const TREDICI_ID = "2f67b2b0-f5ee-4578-a440-d453f325dbdb";

const ENTRIES = [
  {
    title: "Información general de Clínica Luna Pastore",
    category: "negocio",
    enabled: true,
    content: `Clínica Luna Pastore es una clínica de medicina estética facial ubicada en San Miguel de Tucumán, Argentina. Su enfoque está orientado a resultados naturales y personalizados mediante tratamientos faciales no quirúrgicos. Cada paciente recibe una evaluación individual y el tratamiento se planifica según las características de su rostro y sus objetivos.

La clínica trabaja con un enfoque personalizado y por etapas. El agente puede explicar esta información general, pero no debe diagnosticar ni recomendar tratamientos médicos de forma personalizada.`,
  },
  {
    title: "Ubicación, horario y contacto",
    category: "negocio",
    enabled: true,
    content: `Dirección: Gral. José de San Martín 132, San Miguel de Tucumán, Argentina.

Horario de atención: lunes a viernes de 8:30 a 19:00.

La atención se realiza con turno previo.

WhatsApp / teléfono: +54 9 381 542-5300.

Email: lunapastoreclinica@gmail.com.`,
  },
  {
    title: "Tratamientos disponibles",
    category: "productos",
    enabled: true,
    content: `Clínica Luna Pastore ofrece actualmente los siguientes tratamientos de medicina estética facial:

- Armonía labial
- Rinomodelación
- Contorno mandibular
- Armonización facial
- HIFU (ultrasonido focalizado)
- Bioestimuladores de colágeno
- Toxina botulínica

La elección del procedimiento se realiza después de una evaluación profesional.

El agente puede:
- informar que estos servicios existen;
- explicar información general disponible en la base de conocimiento;
- ayudar a coordinar una consulta.

El agente NO puede:
- indicar qué tratamiento necesita una persona;
- diagnosticar;
- recomendar procedimientos personalizados;
- garantizar resultados.`,
  },
  {
    title: "Primera consulta y proceso de atención",
    category: "faq",
    enabled: true,
    content: `La primera consulta consiste en una evaluación en la que el equipo escucha qué desea mejorar el paciente y analiza el rostro para elaborar un plan personalizado y por etapas.

No existe obligación de realizarse un tratamiento el mismo día de la consulta.

El proceso general puede incluir:
1. Escuchar la necesidad del paciente.
2. Evaluar el caso.
3. Definir un plan.
4. Realizar el procedimiento cuando corresponda.
5. Realizar controles posteriores según el tratamiento.

Cuando corresponda, los tratamientos pueden incluir un control posterior aproximadamente a los 15 días.`,
  },
  {
    title: "Solicitud de turnos",
    category: "negocio",
    enabled: true,
    content: `La atención en Clínica Luna Pastore se realiza con turno previo.

Para solicitar una consulta, el paciente puede indicar:
- qué desea mejorar o qué tratamiento le interesa;
- preferencia de horario;
- si es la primera vez que visita la clínica;
- nombre;
- número de WhatsApp;
- correo electrónico si desea proporcionarlo;
- información adicional relevante.

La clínica posteriormente coordina el día y horario de la consulta.

El agente puede ayudar a recopilar esta información y transferir la conversación a un humano para confirmar la cita.`,
  },
  {
    title: "Preguntas frecuentes sobre procedimientos",
    category: "faq",
    enabled: true,
    content: `La clínica informa de forma general que algunos procedimientos pueden realizarse con anestesia tópica y, cuando corresponde, anestesia local.

En muchos procedimientos no se requiere reposo prolongado, aunque esto puede variar según el procedimiento y el paciente.

La duración de los resultados depende del tratamiento y de las características individuales de cada paciente.

IMPORTANTE:
Ante preguntas sobre:
- riesgos;
- contraindicaciones;
- medicamentos;
- diagnóstico;
- efectos secundarios;
- interpretación de síntomas;
- duración exacta en un paciente específico;
- si un procedimiento es adecuado para una persona;

el agente NO debe proporcionar una respuesta médica personalizada.

Debe indicar que esa consulta requiere evaluación de un profesional de la clínica y ofrecer transferir la conversación a un humano.`,
  },
  {
    title: "Criterio de atención y seguridad",
    category: "negocio",
    enabled: true,
    content: `Clínica Luna Pastore busca resultados naturales y trabaja con planes personalizados.

La decisión sobre cualquier procedimiento se realiza después de una evaluación profesional.

La clínica utiliza productos de grado médico y trabaja con protocolos profesionales.

El agente puede comunicar principios generales de atención, pero nunca debe:
- garantizar resultados;
- afirmar que un tratamiento es adecuado para una persona sin evaluación;
- dar diagnósticos;
- recomendar medicamentos;
- interpretar estudios médicos.`,
  },
  {
    title: "Información sobre precios",
    category: "pagos",
    enabled: true,
    content: `Los precios de los tratamientos no están publicados en la información disponible actualmente.

El agente NO debe inventar precios ni dar estimaciones no confirmadas.

Si un usuario pregunta por el precio de un tratamiento, debe responder que no tiene un precio confirmado en la base de conocimiento y ofrecer coordinar la consulta con el equipo de la clínica.`,
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

  const demoKnowBefore = await client.query(
    `select count(*)::int as c,
            coalesce(sum(length(content)),0)::int as bytes
     from public.ai_knowledge_entries where business_id = $1`,
    [DEMO_ID],
  );
  const trediciKnowBefore = await client.query(
    `select count(*)::int as c,
            coalesce(sum(length(content)),0)::int as bytes
     from public.ai_knowledge_entries where business_id = $1`,
    [TREDICI_ID],
  );
  const agentBefore = await client.query(
    `select enabled, length(system_instructions) as si_len,
            human_handoff_enabled, length(human_handoff_instructions) as hi_len
     from public.ai_agent_settings where business_id = $1`,
    [BUSINESS_ID],
  );
  const waBefore = await client.query(
    `select whatsapp_access_token is not null as has_token,
            whatsapp_phone_number_id, whatsapp_connection_status
     from public.business_settings where business_id = $1`,
    [BUSINESS_ID],
  );

  let created = 0;
  let updated = 0;
  const results = [];

  for (const entry of ENTRIES) {
    const existing = await client.query(
      `select id from public.ai_knowledge_entries
       where business_id = $1 and title = $2
       limit 1`,
      [BUSINESS_ID, entry.title],
    );

    if (existing.rowCount > 0) {
      const row = await client.query(
        `update public.ai_knowledge_entries
         set content = $3, category = $4, enabled = $5, updated_at = now()
         where id = $1 and business_id = $2
         returning id, title, category, enabled`,
        [
          existing.rows[0].id,
          BUSINESS_ID,
          entry.content,
          entry.category,
          entry.enabled,
        ],
      );
      updated += 1;
      results.push({ action: "updated", ...row.rows[0] });
    } else {
      const row = await client.query(
        `insert into public.ai_knowledge_entries
           (business_id, title, content, category, enabled)
         values ($1, $2, $3, $4, $5)
         returning id, title, category, enabled`,
        [
          BUSINESS_ID,
          entry.title,
          entry.content,
          entry.category,
          entry.enabled,
        ],
      );
      created += 1;
      results.push({ action: "created", ...row.rows[0] });
    }
  }

  const total = await client.query(
    `select title, category, enabled
     from public.ai_knowledge_entries
     where business_id = $1
     order by title`,
    [BUSINESS_ID],
  );

  const agentAfter = await client.query(
    `select enabled, length(system_instructions) as si_len,
            human_handoff_enabled, length(human_handoff_instructions) as hi_len
     from public.ai_agent_settings where business_id = $1`,
    [BUSINESS_ID],
  );
  const waAfter = await client.query(
    `select whatsapp_access_token is not null as has_token,
            whatsapp_phone_number_id, whatsapp_connection_status
     from public.business_settings where business_id = $1`,
    [BUSINESS_ID],
  );
  const demoKnowAfter = await client.query(
    `select count(*)::int as c,
            coalesce(sum(length(content)),0)::int as bytes
     from public.ai_knowledge_entries where business_id = $1`,
    [DEMO_ID],
  );
  const trediciKnowAfter = await client.query(
    `select count(*)::int as c,
            coalesce(sum(length(content)),0)::int as bytes
     from public.ai_knowledge_entries where business_id = $1`,
    [TREDICI_ID],
  );

  const agentUntouched =
    JSON.stringify(agentBefore.rows[0]) === JSON.stringify(agentAfter.rows[0]);
  const waUntouched =
    JSON.stringify(waBefore.rows[0]) === JSON.stringify(waAfter.rows[0]);
  const demoUntouched =
    JSON.stringify(demoKnowBefore.rows[0]) ===
    JSON.stringify(demoKnowAfter.rows[0]);
  const trediciUntouched =
    JSON.stringify(trediciKnowBefore.rows[0]) ===
    JSON.stringify(trediciKnowAfter.rows[0]);

  console.log(`BUSINESS=${biz.rows[0].name}|${BUSINESS_ID}`);
  console.log(`CREATED=${created}`);
  console.log(`UPDATED=${updated}`);
  console.log(`TOTAL_ENTRIES=${total.rowCount}`);
  console.log(`ENTRIES=${JSON.stringify(results)}`);
  console.log(`FINAL=${JSON.stringify(total.rows)}`);
  console.log(`AGENT=${JSON.stringify(agentAfter.rows[0])}`);
  console.log(`WHATSAPP=${JSON.stringify(waAfter.rows[0])}`);
  console.log(`AGENT_UNTOUCHED=${agentUntouched}`);
  console.log(`WHATSAPP_UNTOUCHED=${waUntouched}`);
  console.log(`DEMO_UNTOUCHED=${demoUntouched}`);
  console.log(`TREDICI_UNTOUCHED=${trediciUntouched}`);

  if (
    total.rowCount !== ENTRIES.length ||
    agentAfter.rows[0].enabled !== false ||
    waAfter.rows[0].has_token ||
    waAfter.rows[0].whatsapp_phone_number_id ||
    !agentUntouched ||
    !waUntouched ||
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
