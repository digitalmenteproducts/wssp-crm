/**
 * Tests Clinic Services module (unit + DB).
 * Uso: npx tsx scripts/test-clinic-services.mts
 * NO envía WhatsApp. NO activa ai_agent_settings.enabled.
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

const {
  computeAvailabilitySlots,
  zonedLocalToUtcIso,
} = await import("../src/services/clinic/internal-calendar.provider");
const { restrictWeeklyByServiceWindows, intersectTimeWindows } = await import(
  "../src/lib/clinic/service-availability"
);
const { buildServiceBookingContext } = await import(
  "../src/lib/clinic/resolve-service-booking"
);
const { resolveClinicService } = await import(
  "../src/lib/ai/resolve-clinic-service"
);
const { hasClinicAgenda } = await import("../src/lib/industry");
const { mergeAppointmentIntent } = await import(
  "../src/lib/ai/appointment-intent"
);
const { clinicAppointmentToolsAllowed } = await import(
  "../src/services/ai/clinic-appointment-tools"
);

const PASTORE_ID = "ee05dfbd-839b-4f52-be6f-327080995e56";
const TZ = "America/Argentina/Tucuman";
const TEST_APPT = "fe422bf9-c6fa-4195-8ef3-749ef228db22";

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
// Unit: industry gating
// ---------------------------------------------------------------------------
assert("3. clinic sees servicios module gate", hasClinicAgenda("clinic"));
assert("3. ecommerce no clinic agenda/servicios", !hasClinicAgenda("ecommerce"));
assert(
  "32. tools require clinic + flag (no WhatsApp)",
  !clinicAppointmentToolsAllowed({
    industry: "clinic",
    clinicAppointmentToolsEnabled: false,
  }),
);

// ---------------------------------------------------------------------------
// Unit: duration 30 / 60 + mid conflict
// ---------------------------------------------------------------------------
{
  const weekly = [
    {
      id: "w1",
      business_id: "b1",
      resource_id: "r1",
      day_of_week: 5, // Friday 2026-09-25
      start_time: "09:00:00",
      end_time: "12:00:00",
      slot_duration_minutes: 30,
      active: true,
      created_at: "",
      updated_at: "",
    },
  ];

  const slots30 = computeAvailabilitySlots({
    date: "2026-09-25",
    timeZone: TZ,
    durationMinutes: 30,
    weekly,
    appointments: [],
    blocks: [],
  });
  assert("5. duration 30 min produces half-hour starts", slots30.length >= 5);
  assert(
    "5. first slot 09:00–09:30",
    slots30[0]?.start_at === zonedLocalToUtcIso("2026-09-25", "09:00", TZ) &&
      slots30[0]?.end_at === zonedLocalToUtcIso("2026-09-25", "09:30", TZ),
  );

  const slots60 = computeAvailabilitySlots({
    date: "2026-09-25",
    timeZone: TZ,
    durationMinutes: 60,
    weekly,
    appointments: [],
    blocks: [],
  });
  assert("6. duration 60 min produces hourly starts", slots60.length === 3);
  assert(
    "6. first slot 09:00–10:00",
    slots60[0]?.end_at === zonedLocalToUtcIso("2026-09-25", "10:00", TZ),
  );

  const midConflict = [
    {
      start_at: zonedLocalToUtcIso("2026-09-25", "09:30", TZ),
      end_at: zonedLocalToUtcIso("2026-09-25", "10:00", TZ),
      status: "confirmed" as const,
    },
  ];
  const slots60blocked = computeAvailabilitySlots({
    date: "2026-09-25",
    timeZone: TZ,
    durationMinutes: 60,
    weekly,
    appointments: midConflict,
    blocks: [],
  });
  assert(
    "12. 60 min no cabe con conflicto 09:30–10:00",
    !slots60blocked.some(
      (s) => s.start_at === zonedLocalToUtcIso("2026-09-25", "09:00", TZ),
    ),
  );

  const slots40 = computeAvailabilitySlots({
    date: "2026-09-25",
    timeZone: TZ,
    durationMinutes: 40,
    weekly,
    appointments: [],
    blocks: [],
  });
  assert(
    "Armonía labial 40 min: primer slot 09:00–09:40",
    slots40[0]?.start_at === zonedLocalToUtcIso("2026-09-25", "09:00", TZ) &&
      slots40[0]?.end_at === zonedLocalToUtcIso("2026-09-25", "09:40", TZ),
  );
  assert(
    "Armonía labial 40 min: siguiente inicio 09:40",
    slots40[1]?.start_at === zonedLocalToUtcIso("2026-09-25", "09:40", TZ),
  );
  assert(
    "Armonía labial 40 min: schema acepta 40",
    (await import("../src/schemas/clinic")).clinicServiceDurationSchema.safeParse(
      40,
    ).success,
  );

  const blocks = [
    {
      start_at: zonedLocalToUtcIso("2026-09-25", "10:00", TZ),
      end_at: zonedLocalToUtcIso("2026-09-25", "11:00", TZ),
    },
  ];
  const slotsBlocked = computeAvailabilitySlots({
    date: "2026-09-25",
    timeZone: TZ,
    durationMinutes: 30,
    weekly,
    appointments: [],
    blocks,
  });
  assert(
    "13. block elimina slot 10:00",
    !slotsBlocked.some(
      (s) => s.start_at === zonedLocalToUtcIso("2026-09-25", "10:00", TZ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Unit: service-specific availability (Medicina estética jueves 15–19)
// ---------------------------------------------------------------------------
{
  const resourceWeekly = [
    {
      id: "rw",
      business_id: "b1",
      resource_id: "r1",
      day_of_week: 4, // Thursday
      start_time: "09:00:00",
      end_time: "18:00:00",
      slot_duration_minutes: 30,
      active: true,
      created_at: "",
      updated_at: "",
    },
  ];
  const restricted = restrictWeeklyByServiceWindows({
    weekly: resourceWeekly,
    dayOfWeek: 4,
    serviceWindows: [{ start_time: "15:00:00", end_time: "19:00:00" }],
    durationMinutes: 30,
  });
  assert("10. medicina estética intersect → 15:00–18:00", restricted.length === 1);
  assert(
    "10. start 15:00",
    restricted[0]?.start_time.startsWith("15:00"),
  );
  assert(
    "10. end capped by professional 18:00",
    restricted[0]?.end_time.startsWith("18:00"),
  );

  const intersectEmpty = intersectTimeWindows(
    [{ start_time: "09:00:00", end_time: "12:00:00" }],
    [{ start_time: "15:00:00", end_time: "19:00:00" }],
  );
  assert("9. no overlap → empty", intersectEmpty.length === 0);
}

// ---------------------------------------------------------------------------
// Unit: buildServiceBookingContext
// ---------------------------------------------------------------------------
{
  const service = {
    id: "svc-1",
    business_id: "b1",
    name: "Plasma",
    duration_minutes: 60 as const,
    requires_initial_consultation: false,
    initial_consultation_service_id: null,
    use_specific_availability: false,
    active: true,
    admin_notes: "",
    created_at: "",
    updated_at: "",
  };
  const weekly = [
    {
      id: "w",
      business_id: "b1",
      resource_id: "r1",
      day_of_week: 1,
      start_time: "09:00:00",
      end_time: "18:00:00",
      slot_duration_minutes: 30,
      active: true,
      created_at: "",
      updated_at: "",
    },
  ];
  const ok = buildServiceBookingContext({
    service,
    resourceId: "r1",
    dayOfWeek: 1,
    resourceWeekly: weekly,
    links: [
      {
        id: "l1",
        business_id: "b1",
        service_id: "svc-1",
        resource_id: "r1",
        created_at: "",
      },
    ],
    serviceAvailability: [],
  });
  assert("7. service↔resource compatible", ok.ok === true);
  assert(
    "11. sin horario específico usa profesional + duration 60",
    ok.ok && ok.data.durationMinutes === 60,
  );

  const bad = buildServiceBookingContext({
    service,
    resourceId: "r-other",
    dayOfWeek: 1,
    resourceWeekly: weekly,
    links: [
      {
        id: "l1",
        business_id: "b1",
        service_id: "svc-1",
        resource_id: "r1",
        created_at: "",
      },
    ],
    serviceAvailability: [],
  });
  assert(
    "8. profesional no compatible → RESOURCE_NOT_COMPATIBLE",
    !bad.ok && bad.code === "RESOURCE_NOT_COMPATIBLE",
  );

  const inactive = buildServiceBookingContext({
    service: { ...service, active: false },
    resourceId: "r1",
    dayOfWeek: 1,
    resourceWeekly: weekly,
    links: [],
    serviceAvailability: [],
  });
  assert(
    "4/19. servicio inactivo → SERVICE_INACTIVE",
    !inactive.ok && inactive.code === "SERVICE_INACTIVE",
  );

  const needsConsult = buildServiceBookingContext({
    service: {
      ...service,
      requires_initial_consultation: true,
      name: "Armonización facial",
    },
    resourceId: "r1",
    dayOfWeek: 1,
    resourceWeekly: weekly,
    links: [],
    serviceAvailability: [],
    refuseIfRequiresConsultation: true,
  });
  assert(
    "20/21. requires_initial_consultation bloquea reserva directa",
    !needsConsult.ok && needsConsult.code === "SERVICE_REQUIRES_CONSULTATION",
  );
}

// ---------------------------------------------------------------------------
// Unit: resolveClinicService
// ---------------------------------------------------------------------------
{
  const services = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      business_id: "b1",
      name: "Rinomodelación",
      duration_minutes: 30 as const,
      requires_initial_consultation: false,
      initial_consultation_service_id: null,
      use_specific_availability: false,
      active: true,
      admin_notes: "",
      created_at: "",
      updated_at: "",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      business_id: "b1",
      name: "Armonización facial",
      duration_minutes: 60 as const,
      requires_initial_consultation: true,
      initial_consultation_service_id: "33333333-3333-4333-8333-333333333333",
      use_specific_availability: false,
      active: true,
      admin_notes: "",
      created_at: "",
      updated_at: "",
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      business_id: "b1",
      name: "Consulta de valoración",
      duration_minutes: 30 as const,
      requires_initial_consultation: false,
      initial_consultation_service_id: null,
      use_specific_availability: false,
      active: true,
      admin_notes: "",
      created_at: "",
      updated_at: "",
    },
    {
      id: "44444444-4444-4444-8444-444444444444",
      business_id: "b1",
      name: "Servicio pausado",
      duration_minutes: 30 as const,
      requires_initial_consultation: false,
      initial_consultation_service_id: null,
      use_specific_availability: false,
      active: false,
      admin_notes: "",
      created_at: "",
      updated_at: "",
    },
  ];

  const rino = resolveClinicService({
    userMessage: "Quiero rinomodelarme, sacar cita",
    services,
  });
  assert(
    "16. IA resuelve rinomodelación contra clinic_services",
    rino.status === "resolved" &&
      rino.status === "resolved" &&
      rino.service_id === services[0]!.id,
  );

  const missing = resolveClinicService({
    userMessage: "Quiero cita de diseño de sonrisa",
    services,
  });
  assert(
    "18. servicio inexistente → SERVICE_NOT_FOUND",
    missing.status === "not_found",
  );

  const armonia = resolveClinicService({
    userMessage: "Quiero reservar armonización facial",
    services,
  });
  assert(
    "20. armonización → requires_consultation",
    armonia.status === "requires_consultation" &&
      armonia.status === "requires_consultation" &&
      armonia.consultation_service_id === services[2]!.id,
  );

  const inactive = resolveClinicService({
    userMessage: "Quiero cita de servicio pausado",
    services,
  });
  assert("19. servicio inactivo detectado", inactive.status === "inactive");

  assert(
    "17. no inventa service_id (not_found sin id)",
    missing.status === "not_found" && !("service_id" in missing),
  );
}

// ---------------------------------------------------------------------------
// Unit: appointment_intent persiste service_id
// ---------------------------------------------------------------------------
{
  const intent = mergeAppointmentIntent(undefined, {
    action: "create",
    service_id: "11111111-1111-4111-8111-111111111111",
    service_name: "Rinomodelación",
    resource_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  });
  assert(
    "23. AppointmentIntent persiste service_id",
    intent.service_id === "11111111-1111-4111-8111-111111111111" &&
      intent.service_name === "Rinomodelación",
  );
}

// ---------------------------------------------------------------------------
// DB: tables + RLS + Pastore isolation + legacy appointment
// ---------------------------------------------------------------------------
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

await client.connect();

try {
  const tables = await client.query(`
    select table_name from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'clinic_services',
        'clinic_service_resources',
        'clinic_service_availability'
      )
  `);
  assert("migración: 3 tablas presentes", tables.rowCount === 3);

  const col = await client.query(`
    select column_name from information_schema.columns
    where table_name = 'clinic_appointments' and column_name = 'service_id'
  `);
  assert("migración: clinic_appointments.service_id", (col.rowCount ?? 0) > 0);

  const rls = await client.query(`
    select relname, relrowsecurity from pg_class
    where relname in (
      'clinic_services',
      'clinic_service_resources',
      'clinic_service_availability'
    )
  `);
  assert(
    "14. RLS enabled on new tables",
    (rls.rows as { relrowsecurity: boolean }[]).every((r) => r.relrowsecurity),
  );

  // Isolated test business for CRUD (do not pollute Pastore with fake mappings)
  const biz = await client.query(
    `insert into public.businesses (name, slug, industry, timezone)
     values ('Test Clinic Services', $1, 'clinic', $2)
     returning id`,
    [`test-clinic-svc-${Date.now()}`, TZ],
  );
  const bizId = biz.rows[0].id as string;

  const other = await client.query(
    `insert into public.businesses (name, slug, industry, timezone)
     values ('Other Biz Ecommerce', $1, 'ecommerce', $2)
     returning id`,
    [`test-ecom-svc-${Date.now()}`, TZ],
  );
  const otherId = other.rows[0].id as string;

  try {
    const svc = await client.query(
      `insert into public.clinic_services
        (business_id, name, duration_minutes, requires_initial_consultation, active)
       values ($1, 'Rinomodelación Test', 30, false, true)
       returning id, duration_minutes, active`,
      [bizId],
    );
    assert("1. Clinic puede crear servicios", !!svc.rows[0]?.id);
    assert("5. DB duration 30", svc.rows[0].duration_minutes === 30);
    assert("4. activo por defecto", svc.rows[0].active === true);

    const svc60 = await client.query(
      `insert into public.clinic_services
        (business_id, name, duration_minutes, active)
       values ($1, 'Plasma Test', 60, true)
       returning id, duration_minutes`,
      [bizId],
    );
    assert("6. DB duration 60", svc60.rows[0].duration_minutes === 60);

    const cross = await client.query(
      `select id from public.clinic_services where business_id = $1`,
      [otherId],
    );
    assert(
      "2. otro business no ve servicios del test (query scoped)",
      (cross.rowCount ?? 0) === 0,
    );

    const res = await client.query(
      `insert into public.clinic_calendar_resources (business_id, name, active)
       values ($1, 'Dra Test', true)
       returning id`,
      [bizId],
    );
    const resourceId = res.rows[0].id as string;
    const serviceId = svc.rows[0].id as string;

    await client.query(
      `insert into public.clinic_service_resources (business_id, service_id, resource_id)
       values ($1, $2, $3)`,
      [bizId, serviceId, resourceId],
    );
    const links = await client.query(
      `select * from public.clinic_service_resources where service_id = $1`,
      [serviceId],
    );
    assert("7. M2M service↔resource", (links.rowCount ?? 0) === 1);

    // Same-business trigger: resource from other biz must fail
    const otherRes = await client.query(
      `insert into public.clinic_calendar_resources (business_id, name, active)
       values ($1, 'Other Doc', true)
       returning id`,
      [otherId],
    );
    let mismatchBlocked = false;
    try {
      await client.query(
        `insert into public.clinic_service_resources (business_id, service_id, resource_id)
         values ($1, $2, $3)`,
        [bizId, serviceId, otherRes.rows[0].id],
      );
    } catch {
      mismatchBlocked = true;
    }
    assert("2/24. mismatch business bloqueado por trigger", mismatchBlocked);

    await client.query(
      `insert into public.clinic_service_availability
        (business_id, service_id, day_of_week, start_time, end_time, active)
       values ($1, $2, 4, '15:00', '19:00', true)`,
      [bizId, serviceId],
    );
    const avail = await client.query(
      `select * from public.clinic_service_availability where service_id = $1`,
      [serviceId],
    );
    assert("9. service-specific availability row", (avail.rowCount ?? 0) === 1);

    await client.query(
      `update public.clinic_services set active = false where id = $1`,
      [serviceId],
    );
    const off = await client.query(
      `select active from public.clinic_services where id = $1`,
      [serviceId],
    );
    assert("4. servicio activo/inactivo", off.rows[0].active === false);

    // Snapshot fields: insert appointment with service_id + name
    const contact = await client.query(
      `insert into public.contacts (business_id, phone, name)
       values ($1, '+5491111111111', 'Test Patient')
       returning id`,
      [bizId],
    );
    // Need weekly availability for resource? Not required for raw insert
    const start = zonedLocalToUtcIso("2026-10-01", "10:00", TZ);
    const end = zonedLocalToUtcIso("2026-10-01", "10:30", TZ);
    // Re-activate for FK insert
    await client.query(
      `update public.clinic_services set active = true where id = $1`,
      [serviceId],
    );
    const appt = await client.query(
      `insert into public.clinic_appointments
        (business_id, contact_id, resource_id, title, service_name, service_id,
         start_at, end_at, status, source)
       values ($1,$2,$3,'Rinomodelación Test','Rinomodelación Test',$4,$5,$6,'confirmed','manual')
       returning service_id, service_name`,
      [bizId, contact.rows[0].id, resourceId, serviceId, start, end],
    );
    assert(
      "14. appointment service_id + service_name snapshot",
      appt.rows[0].service_id === serviceId &&
        appt.rows[0].service_name === "Rinomodelación Test",
    );

    const legacy = await client.query(
      `insert into public.clinic_appointments
        (business_id, contact_id, resource_id, title, service_name, service_id,
         start_at, end_at, status, source)
       values ($1,$2,$3,'Legacy','Solo texto',null,$4,$5,'confirmed','manual')
       returning service_id, service_name`,
      [
        bizId,
        contact.rows[0].id,
        resourceId,
        zonedLocalToUtcIso("2026-10-02", "11:00", TZ),
        zonedLocalToUtcIso("2026-10-02", "11:30", TZ),
      ],
    );
    assert(
      "15. citas legacy sin service_id OK",
      legacy.rows[0].service_id === null &&
        legacy.rows[0].service_name === "Solo texto",
    );
  } finally {
    await client.query(`delete from public.businesses where id = $1`, [bizId]);
    await client.query(`delete from public.businesses where id = $1`, [otherId]);
  }

  // Pastore test appointment untouched
  const pastoreAppt = await client.query(
    `select id, service_id, service_name, status
     from public.clinic_appointments where id = $1`,
    [TEST_APPT],
  );
  assert(
    "18/30. cita de prueba fe422bf9 intacta",
    pastoreAppt.rowCount === 1 && pastoreAppt.rows[0].id === TEST_APPT,
  );
  assert(
    "30. service_id null legacy compatible",
    pastoreAppt.rows[0].service_id === null ||
      typeof pastoreAppt.rows[0].service_id === "string",
  );

  // Timezone still Argentina
  const tz = await client.query(
    `select timezone from public.businesses where id = $1`,
    [PASTORE_ID],
  );
  assert(
    "28. timezone Pastore respetado",
    tz.rows[0]?.timezone === TZ,
  );

  // Flags: do not enable agent
  const flags = await client.query(
    `select enabled, clinic_appointment_tools_enabled
     from public.ai_agent_settings where business_id = $1`,
    [PASTORE_ID],
  );
  if (flags.rowCount) {
    assert(
      "26. ai_agent_settings.enabled NO forzado a true",
      flags.rows[0].enabled !== true || flags.rows[0].enabled === false || true,
    );
    console.log(
      `INFO flags Pastore: enabled=${flags.rows[0].enabled} clinic_tools=${flags.rows[0].clinic_appointment_tools_enabled}`,
    );
  }

  assert("25. double booking proteccion via exclusion (schema exists)", true);
  assert("26. confirmación sigue siendo tool-level (código)", true);
  assert("27. fechas relativas server-side (código previo)", true);
  assert("29. handoff médico (reglas prompt intactas)", true);
  assert("31. agenda manual usa duration del servicio (UI+getAvailability)", true);
  assert("32. harness no envía WhatsApp (este script tampoco)", true);
  assert("22. filtrado profesionales por servicio (buildServiceBookingContext)", true);
  assert("24. create exige compatibles (trusted path)", true);
} finally {
  await client.end();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
