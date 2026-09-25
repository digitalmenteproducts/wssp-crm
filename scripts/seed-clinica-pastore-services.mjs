/**
 * Idempotent seed: Clínica Pastore clinic_services + temp professionals.
 *
 * Uso: node scripts/seed-clinica-pastore-services.mjs
 *
 * NO activa AI, NO WhatsApp, NO crea citas, NO toca citas existentes.
 * Business: ee05dfbd-839b-4f52-be6f-327080995e56
 */
import fs from "node:fs";
import path from "node:path";
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
    if (!value) continue;
    if (!(key in process.env) || !process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

const BUSINESS_ID = "ee05dfbd-839b-4f52-be6f-327080995e56";
const PROTECTED_APPT = "fe422bf9-c6fa-4195-8ef3-749ef228db22";

const TEMP_NOTE =
  "DATOS TEMPORALES / DE PRUEBA — pendientes de confirmación con Clínica Pastore. NO son asociaciones reales.";

const TEMP_RESOURCES = [
  { name: "Profesional Estética 2 (TEMPORAL — reemplazar)", key: "estetica2" },
  { name: "Profesional Cosmiatría (TEMPORAL — reemplazar)", key: "cosmiatria" },
];

/**
 * resource_keys: TEMP testing distribution only.
 * constanza = Dra Constanza (real existing resource)
 */
const SERVICES = [
  {
    name: "Consulta de valoración",
    duration_minutes: 30,
    requires_initial_consultation: false,
    use_specific_availability: false,
    admin_notes:
      "DURACIÓN TEMPORAL PENDIENTE DE CONFIRMACIÓN CON LA CLÍNICA. " + TEMP_NOTE,
    resource_keys: ["constanza", "estetica2"],
  },
  {
    name: "HIFU",
    duration_minutes: 60,
    requires_initial_consultation: false,
    use_specific_availability: false,
    admin_notes: TEMP_NOTE,
    resource_keys: ["constanza", "cosmiatria"],
  },
  {
    name: "Armonía labial",
    duration_minutes: 40,
    requires_initial_consultation: false,
    use_specific_availability: false,
    admin_notes: TEMP_NOTE,
    resource_keys: ["constanza"],
  },
  {
    name: "Rinomodelación",
    duration_minutes: 30,
    requires_initial_consultation: false,
    use_specific_availability: false,
    admin_notes: TEMP_NOTE,
    resource_keys: ["constanza", "estetica2"],
  },
  {
    name: "Contorno mandibular",
    duration_minutes: 45,
    requires_initial_consultation: false,
    use_specific_availability: false,
    admin_notes: TEMP_NOTE,
    resource_keys: ["constanza"],
  },
  {
    name: "Armonización facial",
    duration_minutes: 60,
    requires_initial_consultation: true,
    use_specific_availability: false,
    admin_notes: `${TEMP_NOTE} Requiere Consulta de valoración antes de reservar el tratamiento.`,
    resource_keys: ["constanza"],
    consultation_name: "Consulta de valoración",
  },
  {
    name: "Bioestimuladores de colágeno",
    duration_minutes: 45,
    requires_initial_consultation: false,
    use_specific_availability: false,
    admin_notes: TEMP_NOTE,
    resource_keys: ["constanza"],
  },
  {
    name: "Toxina botulínica",
    duration_minutes: 20,
    requires_initial_consultation: false,
    use_specific_availability: false,
    admin_notes: TEMP_NOTE,
    resource_keys: ["constanza", "estetica2"],
  },
  {
    name: "Medicina estética",
    duration_minutes: 30,
    requires_initial_consultation: false,
    use_specific_availability: true,
    admin_notes: `${TEMP_NOTE} Horario confirmado por clínica: jueves 15:00–19:00.`,
    resource_keys: ["constanza", "estetica2"],
    specific_availability: [
      { day_of_week: 4, start_time: "15:00", end_time: "19:00" },
    ],
  },
  {
    name: "Plasma",
    duration_minutes: 60,
    requires_initial_consultation: false,
    use_specific_availability: false,
    admin_notes: TEMP_NOTE,
    resource_keys: ["cosmiatria"],
  },
  {
    name: "Cosmiatría",
    duration_minutes: 60,
    requires_initial_consultation: false,
    use_specific_availability: false,
    admin_notes: TEMP_NOTE,
    resource_keys: ["cosmiatria"],
  },
];

async function ensureResource(client, name) {
  const existing = await client.query(
    `select id, name from clinic_calendar_resources
     where business_id = $1 and lower(trim(name)) = lower(trim($2))
     limit 1`,
    [BUSINESS_ID, name],
  );
  if (existing.rows[0]) {
    await client.query(
      `update clinic_calendar_resources
       set active = true, updated_at = now()
       where id = $1 and business_id = $2`,
      [existing.rows[0].id, BUSINESS_ID],
    );
    return { id: existing.rows[0].id, name: existing.rows[0].name, created: false };
  }
  const inserted = await client.query(
    `insert into clinic_calendar_resources (business_id, name, active)
     values ($1, $2, true)
     returning id, name`,
    [BUSINESS_ID, name],
  );
  return { id: inserted.rows[0].id, name: inserted.rows[0].name, created: true };
}

async function ensureWeekdayAvailability(client, resourceId) {
  for (let day = 1; day <= 5; day += 1) {
    const existing = await client.query(
      `select id from clinic_availability
       where business_id = $1 and resource_id = $2 and day_of_week = $3
         and start_time = time '09:00' and end_time = time '18:00'
       limit 1`,
      [BUSINESS_ID, resourceId, day],
    );
    if (existing.rows[0]) {
      await client.query(
        `update clinic_availability
         set active = true, slot_duration_minutes = 30, updated_at = now()
         where id = $1`,
        [existing.rows[0].id],
      );
      continue;
    }
    await client.query(
      `insert into clinic_availability
        (business_id, resource_id, day_of_week, start_time, end_time,
         slot_duration_minutes, active)
       values ($1, $2, $3, '09:00', '18:00', 30, true)`,
      [BUSINESS_ID, resourceId, day],
    );
  }
}

async function upsertService(client, svc, consultationId) {
  const existing = await client.query(
    `select id from clinic_services
     where business_id = $1 and lower(trim(name)) = lower(trim($2))
     limit 1`,
    [BUSINESS_ID, svc.name],
  );

  const params = [
    svc.duration_minutes,
    svc.requires_initial_consultation,
    consultationId,
    svc.use_specific_availability,
    true,
    svc.admin_notes,
  ];

  if (existing.rows[0]) {
    const updated = await client.query(
      `update clinic_services set
         duration_minutes = $2,
         requires_initial_consultation = $3,
         initial_consultation_service_id = $4,
         use_specific_availability = $5,
         active = $6,
         admin_notes = $7,
         updated_at = now()
       where id = $1 and business_id = $8
       returning id, name, duration_minutes, requires_initial_consultation,
                 initial_consultation_service_id, use_specific_availability, active, admin_notes`,
      [existing.rows[0].id, ...params, BUSINESS_ID],
    );
    return { ...updated.rows[0], created: false };
  }

  const inserted = await client.query(
    `insert into clinic_services
      (business_id, name, duration_minutes, requires_initial_consultation,
       initial_consultation_service_id, use_specific_availability, active, admin_notes)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id, name, duration_minutes, requires_initial_consultation,
               initial_consultation_service_id, use_specific_availability, active, admin_notes`,
    [BUSINESS_ID, svc.name, ...params],
  );
  return { ...inserted.rows[0], created: true };
}

async function syncServiceResources(client, serviceId, resourceIds) {
  const current = await client.query(
    `select resource_id from clinic_service_resources
     where business_id = $1 and service_id = $2`,
    [BUSINESS_ID, serviceId],
  );
  const currentSet = new Set(current.rows.map((r) => r.resource_id));
  const desired = new Set(resourceIds);

  for (const rid of desired) {
    if (currentSet.has(rid)) continue;
    await client.query(
      `insert into clinic_service_resources (business_id, service_id, resource_id)
       values ($1, $2, $3)
       on conflict (service_id, resource_id) do nothing`,
      [BUSINESS_ID, serviceId, rid],
    );
  }
  for (const rid of currentSet) {
    if (desired.has(rid)) continue;
    await client.query(
      `delete from clinic_service_resources
       where business_id = $1 and service_id = $2 and resource_id = $3`,
      [BUSINESS_ID, serviceId, rid],
    );
  }
}

async function syncServiceAvailability(client, serviceId, windows) {
  if (!windows || windows.length === 0) {
    await client.query(
      `delete from clinic_service_availability
       where business_id = $1 and service_id = $2`,
      [BUSINESS_ID, serviceId],
    );
    return;
  }

  const keepIds = [];
  for (const win of windows) {
    const existing = await client.query(
      `select id from clinic_service_availability
       where business_id = $1 and service_id = $2 and day_of_week = $3
         and start_time = $4::time and end_time = $5::time
       limit 1`,
      [BUSINESS_ID, serviceId, win.day_of_week, win.start_time, win.end_time],
    );
    if (existing.rows[0]) {
      await client.query(
        `update clinic_service_availability
         set active = true, updated_at = now() where id = $1`,
        [existing.rows[0].id],
      );
      keepIds.push(existing.rows[0].id);
      continue;
    }
    const inserted = await client.query(
      `insert into clinic_service_availability
        (business_id, service_id, day_of_week, start_time, end_time, active)
       values ($1, $2, $3, $4::time, $5::time, true)
       returning id`,
      [BUSINESS_ID, serviceId, win.day_of_week, win.start_time, win.end_time],
    );
    keepIds.push(inserted.rows[0].id);
  }

  await client.query(
    `delete from clinic_service_availability
     where business_id = $1 and service_id = $2
       and not (id = any($3::uuid[]))`,
    [BUSINESS_ID, serviceId, keepIds],
  );
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

await client.connect();

try {
  const biz = await client.query(
    `select id, name, industry from businesses where id = $1`,
    [BUSINESS_ID],
  );
  if (!biz.rows[0] || biz.rows[0].industry !== "clinic") {
    throw new Error("Business Pastore clinic not found / wrong industry");
  }
  console.log("Business:", biz.rows[0].name, biz.rows[0].id);

  const apptBefore = await client.query(
    `select id, service_id, service_name, status, start_at, end_at, resource_id
     from clinic_appointments where id = $1`,
    [PROTECTED_APPT],
  );
  console.log("Protected appointment BEFORE:", apptBefore.rows[0] ?? null);

  const existingResources = await client.query(
    `select id, name, active from clinic_calendar_resources
     where business_id = $1 order by name`,
    [BUSINESS_ID],
  );
  console.log("Resources before:", existingResources.rows);

  const constanza = existingResources.rows.find(
    (r) => r.name.trim().toLowerCase() === "dra constanza",
  );
  if (!constanza) {
    throw new Error("Dra Constanza not found — aborting");
  }
  console.log(
    "Dra Constanza kept (availability NOT overwritten):",
    constanza.id,
  );

  const resourceMap = { constanza: constanza.id };

  for (const temp of TEMP_RESOURCES) {
    const res = await ensureResource(client, temp.name);
    resourceMap[temp.key] = res.id;
    await ensureWeekdayAvailability(client, res.id);
    console.log(
      `${res.created ? "CREATED" : "EXISTS"} ${res.name} → ${res.id}`,
    );
  }

  const serviceByName = new Map();

  for (const svc of SERVICES) {
    const consultationId = svc.consultation_name
      ? (serviceByName.get(svc.consultation_name)?.id ?? null)
      : null;

    if (svc.consultation_name && !consultationId) {
      throw new Error(
        `Consulta previa "${svc.consultation_name}" must be seeded before ${svc.name}`,
      );
    }

    const row = await upsertService(client, svc, consultationId);
    serviceByName.set(svc.name, row);

    const resourceIds = svc.resource_keys.map((k) => {
      const id = resourceMap[k];
      if (!id) throw new Error(`Missing resource key ${k}`);
      return id;
    });
    await syncServiceResources(client, row.id, resourceIds);
    await syncServiceAvailability(
      client,
      row.id,
      svc.use_specific_availability ? svc.specific_availability : [],
    );

    console.log(
      `${row.created ? "CREATED" : "UPSERT"} ${row.name} ${row.duration_minutes}min (${row.id})`,
    );
  }

  // --- Verification report ---
  const services = await client.query(
    `select id, name, duration_minutes, active, requires_initial_consultation,
            initial_consultation_service_id, use_specific_availability, admin_notes
     from clinic_services where business_id = $1 order by name`,
    [BUSINESS_ID],
  );
  const resources = await client.query(
    `select id, name, active from clinic_calendar_resources
     where business_id = $1 order by name`,
    [BUSINESS_ID],
  );
  const links = await client.query(
    `select s.name as service, r.name as resource
     from clinic_service_resources sr
     join clinic_services s on s.id = sr.service_id
     join clinic_calendar_resources r on r.id = sr.resource_id
     where sr.business_id = $1
     order by s.name, r.name`,
    [BUSINESS_ID],
  );
  const svcAvail = await client.query(
    `select s.name, a.day_of_week, a.start_time::text, a.end_time::text, a.active
     from clinic_service_availability a
     join clinic_services s on s.id = a.service_id
     where a.business_id = $1
     order by s.name, a.day_of_week`,
    [BUSINESS_ID],
  );
  const resAvail = await client.query(
    `select r.name, a.day_of_week, a.start_time::text, a.end_time::text,
            a.slot_duration_minutes, a.active
     from clinic_availability a
     join clinic_calendar_resources r on r.id = a.resource_id
     where a.business_id = $1
     order by r.name, a.day_of_week, a.start_time`,
    [BUSINESS_ID],
  );
  const apptAfter = await client.query(
    `select id, service_id, service_name, status, start_at, end_at, resource_id
     from clinic_appointments where id = $1`,
    [PROTECTED_APPT],
  );
  const flags = await client.query(
    `select enabled, clinic_appointment_tools_enabled
     from ai_agent_settings where business_id = $1`,
    [BUSINESS_ID],
  );
  const counts = await client.query(
    `select
       (select count(*)::int from clinic_services where business_id = $1) as services,
       (select count(*)::int from clinic_calendar_resources where business_id = $1) as resources,
       (select count(*)::int from clinic_service_resources where business_id = $1) as links,
       (select count(*)::int from clinic_service_availability where business_id = $1) as svc_avail`,
    [BUSINESS_ID],
  );

  const before = apptBefore.rows[0];
  const after = apptAfter.rows[0];
  const apptUnchanged =
    before &&
    after &&
    before.service_id === after.service_id &&
    before.service_name === after.service_name &&
    before.status === after.status &&
    String(before.start_at) === String(after.start_at) &&
    String(before.end_at) === String(after.end_at) &&
    before.resource_id === after.resource_id;

  console.log("\n=== SEED REPORT ===");
  console.log(JSON.stringify({
    counts: counts.rows[0],
    services: services.rows,
    resources: resources.rows,
    links: links.rows,
    service_availability: svcAvail.rows,
    resource_availability: resAvail.rows,
    protected_appointment_unchanged: apptUnchanged,
    protected_appointment: after,
    flags: flags.rows[0],
  }, null, 2));
} finally {
  await client.end();
}
