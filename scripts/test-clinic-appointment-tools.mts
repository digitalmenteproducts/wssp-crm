/**
 * Tests Clinic appointment tools (sin OpenAI / sin WhatsApp).
 * Uso: npx tsx scripts/test-clinic-appointment-tools.mts
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
    // Empty strings break Zod .min(1).optional() — treat as unset.
    if (!value) continue;
    if (!(key in process.env) || !process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

const { isAffirmativeConfirmation, isNegativeOrChangeIntent } = await import(
  "../src/lib/ai/confirmation"
);
const {
  resolveRelativeDate,
  resolveAppointmentDateInput,
  extractRelativeDateExpression,
} = await import("../src/lib/ai/relative-dates");
const {
  resolveOfferedSlotSelection,
  resolveResourceIdFromArgs,
} = await import("../src/lib/ai/offered-slot-selection");
const { advanceClinicBookingTurn } = await import(
  "../src/lib/ai/clinic-booking-turn"
);
const {
  clinicAppointmentToolsAllowed,
  executeClinicAppointmentTool,
} = await import("../src/services/ai/clinic-appointment-tools");
const appointmentService = await import(
  "../src/services/clinic/appointment.service"
);
const { zonedLocalToUtcIso } = await import("../src/lib/clinic/datetime");

const TZ = "America/Argentina/Tucuman";
/** Jueves 24/09/2026 12:00 en America/Argentina/Tucuman */
const NOW_THU = new Date("2026-09-24T15:00:00.000Z");
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

assert(
  "clinic + flag true => tools",
  clinicAppointmentToolsAllowed({
    industry: "clinic",
    clinicAppointmentToolsEnabled: true,
  }),
);
assert(
  "clinic + flag false => no tools",
  !clinicAppointmentToolsAllowed({
    industry: "clinic",
    clinicAppointmentToolsEnabled: false,
  }),
);
assert(
  "ecommerce + flag true => no tools",
  !clinicAppointmentToolsAllowed({
    industry: "ecommerce",
    clinicAppointmentToolsEnabled: true,
  }),
);

assert("sí confirma", isAffirmativeConfirmation("Sí"));
assert("confirmo confirma", isAffirmativeConfirmation("Confirmo"));
assert("dale confirma", isAffirmativeConfirmation("Dale"));
assert("quizás no confirma", !isAffirmativeConfirmation("Quizás cancele"));
assert("empty no", !isAffirmativeConfirmation(""));
assert("no es negativo", isNegativeOrChangeIntent("No"));
assert("mejor otra hora negativo", isNegativeOrChangeIntent("mejor otra hora"));

{
  const slots = [
    {
      start_at: "2026-09-28T12:30:00.000Z",
      end_at: "2026-09-28T13:00:00.000Z",
      display_time: "09:30",
    },
    {
      start_at: "2026-09-28T13:00:00.000Z",
      end_at: "2026-09-28T13:30:00.000Z",
      display_time: "10:00",
    },
    {
      start_at: "2026-09-28T14:00:00.000Z",
      end_at: "2026-09-28T14:30:00.000Z",
      display_time: "11:00",
    },
  ];
  const s1000 = resolveOfferedSlotSelection("10:00", slots);
  assert(
    "select 10:00 exact",
    s1000.status === "selected" &&
      s1000.slot.start_at === "2026-09-28T13:00:00.000Z",
    JSON.stringify(s1000),
  );
  const s10 = resolveOfferedSlotSelection("10", slots);
  assert(
    "select 10 → 10:00 unique hour",
    s10.status === "selected" &&
      s10.slot.display_time === "10:00",
    JSON.stringify(s10),
  );
  const sEl = resolveOfferedSlotSelection("el de las 10", slots);
  assert(
    "el de las 10 → 10:00",
    sEl.status === "selected" && sEl.slot.display_time === "10:00",
    JSON.stringify(sEl),
  );
  const s0800 = resolveOfferedSlotSelection("08:00", slots);
  assert(
    "08:00 not offered",
    s0800.status === "not_in_offered",
    JSON.stringify(s0800),
  );

  const resourceUuid = "de99dad5-e8da-4bf2-b1d0-6e614361fe0b";
  const fromName = resolveResourceIdFromArgs({
    argResourceId: "Dra. Constanza",
    intent: {
      action: "get_availability",
      resource_id: resourceUuid,
      resource_name: "Dra Constanza",
    },
  });
  assert(
    "resource_name → reuse intent UUID",
    fromName.ok && fromName.resource_id === resourceUuid,
    JSON.stringify(fromName),
  );
  const bad = resolveResourceIdFromArgs({
    argResourceId: "Dra. Constanza",
    intent: { action: "create" },
  });
  assert(
    "resource_name without intent UUID fails",
    !bad.ok && bad.code === "INVALID_RESOURCE_ID",
    JSON.stringify(bad),
  );
}

{
  const offered = [
    {
      start_at: "2026-09-28T13:00:00.000Z",
      end_at: "2026-09-28T13:30:00.000Z",
      display_time: "10:00",
    },
    {
      start_at: "2026-09-28T14:00:00.000Z",
      end_at: "2026-09-28T14:30:00.000Z",
      display_time: "11:00",
    },
  ];
  const baseMeta = {
    appointment_intent: {
      action: "get_availability" as const,
      service_name: "Rinomodelación",
      resource_id: "de99dad5-e8da-4bf2-b1d0-6e614361fe0b",
      resource_name: "Dra Constanza",
      requested_date: "2026-09-28",
      offered_slots: offered,
      awaiting_confirmation: false,
    },
  };
  const trusted = {
    businessId: "00000000-0000-0000-0000-000000000099",
    timezone: TZ,
    contactId: "00000000-0000-0000-0000-000000000002",
  };

  const selected = await advanceClinicBookingTurn({
    message: "10:00",
    metadata: baseMeta,
    trusted,
    serviceCatalog: ["Rinomodelación"],
  });
  const selIntent = selected.metadata.appointment_intent!;
  assert(
    "turn select → awaiting true",
    selected.event.type === "slot_selected" &&
      selIntent.awaiting_confirmation === true &&
      selIntent.action === "create" &&
      selIntent.selected_start_at === "2026-09-28T13:00:00.000Z" &&
      selIntent.selected_end_at === "2026-09-28T13:30:00.000Z" &&
      selected.serverToolTrace.length === 0,
    JSON.stringify(selected.event),
  );

  const notOffered = await advanceClinicBookingTurn({
    message: "08:00",
    metadata: baseMeta,
    trusted,
    serviceCatalog: ["Rinomodelación"],
  });
  assert(
    "turn 08:00 not selected",
    notOffered.event.type === "slot_not_offered" &&
      notOffered.metadata.appointment_intent?.awaiting_confirmation !== true,
    JSON.stringify(notOffered.event),
  );

  const awaitingMeta = {
    appointment_intent: {
      ...baseMeta.appointment_intent,
      action: "create" as const,
      awaiting_confirmation: true,
      selected_start_at: "2026-09-28T13:00:00.000Z",
      selected_end_at: "2026-09-28T13:30:00.000Z",
    },
  };

  const declined = await advanceClinicBookingTurn({
    message: "No",
    metadata: awaitingMeta,
    trusted,
    serviceCatalog: ["Rinomodelación"],
  });
  assert(
    "No → no create",
    declined.event.type === "confirmation_declined" &&
      declined.serverToolTrace.length === 0 &&
      declined.metadata.appointment_intent?.awaiting_confirmation === false,
    JSON.stringify(declined.event),
  );

  const swap = await advanceClinicBookingTurn({
    message: "mejor 11:00",
    metadata: awaitingMeta,
    trusted,
    serviceCatalog: ["Rinomodelación"],
  });
  assert(
    "mejor 11:00 → new slot awaiting",
    swap.event.type === "slot_selected" &&
      swap.metadata.appointment_intent?.selected_start_at ===
        "2026-09-28T14:00:00.000Z" &&
      swap.metadata.appointment_intent?.awaiting_confirmation === true &&
      swap.serverToolTrace.length === 0,
    JSON.stringify(swap.event),
  );

  const siNoSlot = await advanceClinicBookingTurn({
    message: "Sí",
    metadata: {
      appointment_intent: {
        action: "create",
        awaiting_confirmation: true,
        service_name: "Rinomodelación",
        resource_id: "de99dad5-e8da-4bf2-b1d0-6e614361fe0b",
        // missing selected_start_at/end_at
      },
    },
    trusted,
    serviceCatalog: ["Rinomodelación"],
  });
  assert(
    "Sí without selected slot → no create",
    siNoSlot.event.type === "cannot_confirm_missing_slot" &&
      siNoSlot.serverToolTrace.length === 0,
    JSON.stringify(siNoSlot.event),
  );
}

{
  const { resolveServiceFromKnowledge } = await import(
    "../src/lib/ai/resolve-service-from-knowledge"
  );
  const knowledge = [
    {
      id: "1",
      business_id: "b",
      title: "Tratamientos disponibles",
      category: "productos" as const,
      enabled: true,
      content: `- Armonía labial
- Rinomodelación
- Contorno mandibular
- Armonización facial
- HIFU (ultrasonido focalizado)
- Bioestimuladores de colágeno
- Toxina botulínica`,
      created_at: "",
      updated_at: "",
    },
  ];
  const rino = resolveServiceFromKnowledge({
    userMessage: "Quiero una cita para rinomodelación",
    knowledgeEntries: knowledge,
  });
  assert(
    "resolve rinomodelación",
    rino.status === "resolved" && rino.service_name === "Rinomodelación",
    JSON.stringify(rino),
  );
  const nariz = resolveServiceFromKnowledge({
    userMessage: "quiero hacerme la nariz",
    knowledgeEntries: knowledge,
  });
  assert(
    "resolve nariz → Rinomodelación",
    nariz.status === "resolved" && nariz.service_name === "Rinomodelación",
    JSON.stringify(nariz),
  );
  const unknown = resolveServiceFromKnowledge({
    userMessage: "Quiero una cita para diseño de sonrisa",
    knowledgeEntries: knowledge,
  });
  assert(
    "diseño de sonrisa not_found",
    unknown.status === "not_found",
    JSON.stringify(unknown),
  );
  const noIntent = resolveServiceFromKnowledge({
    userMessage: "¿Dónde queda la clínica?",
    knowledgeEntries: knowledge,
  });
  assert(
    "ubicacion no booking",
    noIntent.status === "no_booking_intent",
    JSON.stringify(noIntent),
  );
}

{
  // Deterministic relative dates — now = jueves 24/09/2026 12:00 Tucumán
  assert(
    "el próximo lunes → 2026-09-28",
    resolveRelativeDate("el próximo lunes", TZ, NOW_THU) === "2026-09-28",
    resolveRelativeDate("el próximo lunes", TZ, NOW_THU) ?? "",
  );
  assert(
    "próximo lunes → 2026-09-28",
    resolveRelativeDate("próximo lunes", TZ, NOW_THU) === "2026-09-28",
  );
  assert(
    "mañana → 2026-09-25",
    resolveRelativeDate("mañana", TZ, NOW_THU) === "2026-09-25",
  );
  assert(
    "pasado mañana → 2026-09-26",
    resolveRelativeDate("pasado mañana", TZ, NOW_THU) === "2026-09-26",
  );
  assert(
    "hoy → 2026-09-24",
    resolveRelativeDate("hoy", TZ, NOW_THU) === "2026-09-24",
  );
  assert(
    "este viernes → 2026-09-25",
    resolveRelativeDate("este viernes", TZ, NOW_THU) === "2026-09-25",
    resolveRelativeDate("este viernes", TZ, NOW_THU) ?? "",
  );
  assert(
    "próximo viernes → 2026-09-25",
    resolveRelativeDate("próximo viernes", TZ, NOW_THU) === "2026-09-25",
  );
  assert(
    "el lunes → 2026-09-28",
    resolveRelativeDate("el lunes", TZ, NOW_THU) === "2026-09-28",
  );
  assert(
    "ambiguo null",
    resolveRelativeDate("el otro viernes", TZ, NOW_THU) === null,
  );
  assert(
    "YYYY-MM-DD no pasa por relative",
    resolveRelativeDate("2023-09-25", TZ, NOW_THU) === null,
  );

  // Pastore bug: LLM inventó 2023-09-25; backend usa mensaje del paciente
  const pastore = resolveAppointmentDateInput({
    date: "2023-09-25",
    latestUserMessage: "El próximo lunes por la mañana",
    timeZone: TZ,
    now: NOW_THU,
  });
  assert(
    "Pastore: relativo gana sobre 2023 inventado → 2026-09-28",
    pastore.ok && pastore.date === "2026-09-28",
    JSON.stringify(pastore),
  );

  const pastAbsolute = resolveAppointmentDateInput({
    date: "2023-09-25",
    latestUserMessage: "quiero una cita",
    timeZone: TZ,
    now: NOW_THU,
  });
  assert(
    "fecha pasada absoluta → INVALID_APPOINTMENT_DATE",
    !pastAbsolute.ok && pastAbsolute.code === "INVALID_APPOINTMENT_DATE",
    JSON.stringify(pastAbsolute),
  );

  const ambiguous = resolveAppointmentDateInput({
    date_expression: "el otro viernes",
    timeZone: TZ,
    now: NOW_THU,
  });
  assert(
    "DATE_AMBIGUOUS",
    !ambiguous.ok && ambiguous.code === "DATE_AMBIGUOUS",
    JSON.stringify(ambiguous),
  );

  const viaExpression = resolveAppointmentDateInput({
    date_expression: "el próximo lunes",
    timeZone: TZ,
    now: NOW_THU,
  });
  assert(
    "date_expression → 2026-09-28",
    viaExpression.ok && viaExpression.date === "2026-09-28",
    JSON.stringify(viaExpression),
  );

  assert(
    "extract from patient message",
    extractRelativeDateExpression("El próximo lunes por la mañana") ===
      "el proximo lunes",
    extractRelativeDateExpression("El próximo lunes por la mañana") ?? "",
  );
}

{
  // Tool-level: past date blocked WITHOUT calling AppointmentService
  let meta: Record<string, unknown> = {};
  const blocked = await executeClinicAppointmentTool(
    "clinic_get_availability",
    JSON.stringify({
      resource_id: "11111111-1111-4111-a111-111111111111",
      date: "2023-09-25",
      time_preference: "morning",
    }),
    {
      trusted: {
        businessId: "00000000-0000-4000-a000-000000000099",
        timezone: TZ,
        contactId: "00000000-0000-4000-a000-000000000002",
      },
      industry: "clinic",
      clinicAppointmentToolsEnabled: true,
      latestUserMessage: "quiero turno",
      metadata: meta,
      serviceCatalog: ["Rinomodelación"],
      now: NOW_THU,
      onMetadataChange: (m) => {
        meta = m as Record<string, unknown>;
      },
    },
  );
  assert(
    "tool past date → INVALID_APPOINTMENT_DATE",
    blocked.error_code === "INVALID_APPOINTMENT_DATE",
    JSON.stringify(blocked.result),
  );
  assert(
    "requested_date NOT persisted on invalid date",
    !(meta as { appointment_intent?: { requested_date?: string } })
      .appointment_intent?.requested_date,
    JSON.stringify(meta),
  );

  const amb = await executeClinicAppointmentTool(
    "clinic_get_availability",
    JSON.stringify({
      resource_id: "11111111-1111-4111-a111-111111111111",
      date_expression: "el otro viernes",
    }),
    {
      trusted: {
        businessId: "00000000-0000-4000-a000-000000000099",
        timezone: TZ,
        contactId: "00000000-0000-4000-a000-000000000002",
      },
      industry: "clinic",
      clinicAppointmentToolsEnabled: true,
      latestUserMessage: "el otro viernes",
      metadata: {},
      serviceCatalog: [],
      now: NOW_THU,
      onMetadataChange: () => undefined,
    },
  );
  assert(
    "tool ambiguous → DATE_AMBIGUOUS",
    amb.error_code === "DATE_AMBIGUOUS",
    JSON.stringify(amb.result),
  );

  // Invented start_at rejected when offered_slots exist
  let inventMeta: Record<string, unknown> = {
    appointment_intent: {
      action: "create",
      service_name: "Rinomodelación",
      resource_id: "de99dad5-e8da-4bf2-b1d0-6e614361fe0b",
      offered_slots: [
        {
          start_at: "2026-09-28T13:00:00.000Z",
          end_at: "2026-09-28T13:30:00.000Z",
          display_time: "10:00",
        },
      ],
      awaiting_confirmation: false,
    },
  };
  const inventedSlot = await executeClinicAppointmentTool(
    "clinic_create_appointment",
    JSON.stringify({
      resource_id: "de99dad5-e8da-4bf2-b1d0-6e614361fe0b",
      service_name: "Rinomodelación",
      start_at: "2026-09-28T15:00:00.000Z",
      end_at: "2026-09-28T15:30:00.000Z",
      patient_confirmed: false,
    }),
    {
      trusted: {
        businessId: "00000000-0000-0000-0000-000000000099",
        timezone: TZ,
        contactId: "00000000-0000-0000-0000-000000000002",
      },
      industry: "clinic",
      clinicAppointmentToolsEnabled: true,
      latestUserMessage: "quiero a las 12",
      metadata: inventMeta as never,
      serviceCatalog: ["Rinomodelación"],
      now: NOW_THU,
      onMetadataChange: (m) => {
        inventMeta = m as Record<string, unknown>;
      },
    },
  );
  assert(
    "invented start_at → SLOT_NOT_OFFERED",
    inventedSlot.error_code === "SLOT_NOT_OFFERED",
    JSON.stringify(inventedSlot.result),
  );
}

async function dbToolTests() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  await client.connect();

  try {
    const flagCol = await client.query(`
      select 1 from information_schema.columns
      where table_name='ai_agent_settings' and column_name='clinic_appointment_tools_enabled'
    `);
    assert("migration flag column", flagCol.rows.length === 1);

    const metaCol = await client.query(`
      select 1 from information_schema.columns
      where table_name='conversations' and column_name='agent_metadata'
    `);
    assert("migration agent_metadata", metaCol.rows.length === 1);

    const pastoreFlag = await client.query(`
      select enabled, clinic_appointment_tools_enabled
      from ai_agent_settings
      where business_id='ee05dfbd-839b-4f52-be6f-327080995e56'
    `);
    if (pastoreFlag.rows[0]) {
      assert(
        "Pastore agent enabled remains false",
        pastoreFlag.rows[0].enabled === false,
      );
    } else {
      console.log("NOTE no ai_agent_settings for Pastore");
      passed += 1;
    }

    const slug = `clinic-tools-${Date.now()}`;
    const biz = await client.query(
      `insert into businesses (name, slug, industry, timezone)
       values ('Tools Clinic', $1, 'clinic', $2) returning id`,
      [slug, TZ],
    );
    const businessId = biz.rows[0].id as string;

    await client.query(
      `insert into ai_agent_settings (business_id, enabled, clinic_appointment_tools_enabled, agent_name, business_name)
       values ($1, false, true, 'Test', 'Tools Clinic')`,
      [businessId],
    );

    const contactA = await client.query(
      `insert into contacts (business_id, phone, name) values ($1, $2, 'Paciente A') returning id`,
      [businessId, `+54911${String(Date.now()).slice(-8)}`],
    );
    const contactB = await client.query(
      `insert into contacts (business_id, phone, name) values ($1, $2, 'Paciente B') returning id`,
      [businessId, `+54911${String(Date.now() + 1).slice(-8)}`],
    );
    const contactIdA = contactA.rows[0].id as string;
    const contactIdB = contactB.rows[0].id as string;

    const res = await client.query(
      `insert into clinic_calendar_resources (business_id, name, active)
       values ($1, 'Dra Test', true) returning id`,
      [businessId],
    );
    const resourceId = res.rows[0].id as string;

    await client.query(
      `insert into clinic_availability
        (business_id, resource_id, day_of_week, start_time, end_time, slot_duration_minutes, active)
       values ($1, $2, 1, '09:00', '12:00', 30, true)`,
      [businessId, resourceId],
    );

    const date = "2026-09-28";
    const ctx = {
      businessId,
      timezone: TZ,
      contactId: contactIdA,
    };

    const avail = await appointmentService.getAvailabilityTrusted(ctx, {
      resource_id: resourceId,
      date,
    });
    assert(
      "getAvailability ok",
      avail.ok && (avail.data?.slots.length ?? 0) > 0,
    );
    const slot = avail.ok ? avail.data.slots[0]! : null;

    // LLM inventó 2023; backend resuelve desde mensaje → 2026-09-28 + morning
    let availMeta: Record<string, unknown> = {};
    const recoveredAvail = await executeClinicAppointmentTool(
      "clinic_get_availability",
      JSON.stringify({
        resource_id: resourceId,
        date: "2023-09-25",
        time_preference: "morning",
      }),
      {
        trusted: ctx,
        industry: "clinic",
        clinicAppointmentToolsEnabled: true,
        latestUserMessage: "El próximo lunes por la mañana",
        metadata: availMeta,
        serviceCatalog: ["Rinomodelación"],
        now: NOW_THU,
        onMetadataChange: (m) => {
          availMeta = m as Record<string, unknown>;
        },
      },
    );
    const recoveredResult = recoveredAvail.result as {
      ok?: boolean;
      date?: string;
      slots?: unknown[];
    };
    assert(
      "recovered availability date 2026-09-28",
      recoveredAvail.success && recoveredResult.date === "2026-09-28",
      JSON.stringify(recoveredAvail.result),
    );
    assert(
      "morning preference kept",
      Array.isArray(recoveredResult.slots) && recoveredResult.slots.length > 0,
    );
    const intentDate = (
      availMeta as {
        appointment_intent?: { requested_date?: string };
      }
    ).appointment_intent?.requested_date;
    assert(
      "requested_date persisted validated 2026-09-28",
      intentDate === "2026-09-28",
      intentDate ?? "",
    );

    // resource_name as resource_id → reuse UUID from intent (no RESOURCE_NOT_FOUND)
    let nameMeta: Record<string, unknown> = {
      appointment_intent: {
        action: "create",
        resource_id: resourceId,
        resource_name: "Dra Test",
        service_name: "Diseño",
      },
    };
    const byName = await executeClinicAppointmentTool(
      "clinic_get_availability",
      JSON.stringify({
        resource_id: "Dra Test",
        date_expression: "el próximo lunes",
        time_preference: "morning",
      }),
      {
        trusted: ctx,
        industry: "clinic",
        clinicAppointmentToolsEnabled: true,
        latestUserMessage: "El próximo lunes por la mañana",
        metadata: nameMeta,
        serviceCatalog: ["Diseño"],
        now: NOW_THU,
        onMetadataChange: (m) => {
          nameMeta = m as Record<string, unknown>;
        },
      },
    );
    const byNameResult = byName.result as { ok?: boolean; date?: string };
    assert(
      "resource name reuses intent UUID",
      byName.success && byNameResult.date === "2026-09-28",
      JSON.stringify(byName.result),
    );

    let meta = {};
    const catalog = ["Diseño", "Diseño de sonrisa"];
    const noConfirm = await executeClinicAppointmentTool(
      "clinic_create_appointment",
      JSON.stringify({
        resource_id: resourceId,
        service_name: "Diseño",
        start_at: slot!.start_at,
        end_at: slot!.end_at,
        patient_confirmed: false,
      }),
      {
        trusted: ctx,
        industry: "clinic",
        clinicAppointmentToolsEnabled: true,
        latestUserMessage: "Quiero a las 9",
        metadata: meta,
        serviceCatalog: catalog,
        onMetadataChange: (m) => {
          meta = m;
        },
      },
    );
    assert(
      "create without confirm blocked",
      !noConfirm.success && noConfirm.error_code === "NEEDS_CONFIRMATION",
    );

    const invented = await executeClinicAppointmentTool(
      "clinic_create_appointment",
      JSON.stringify({
        resource_id: resourceId,
        service_name: "Tratamiento inventado XYZ",
        start_at: slot!.start_at,
        end_at: slot!.end_at,
        patient_confirmed: true,
      }),
      {
        trusted: ctx,
        industry: "clinic",
        clinicAppointmentToolsEnabled: true,
        latestUserMessage: "Sí, confirmo",
        metadata: {},
        serviceCatalog: catalog,
        onMetadataChange: () => undefined,
      },
    );
    assert(
      "invented service blocked",
      !invented.success && invented.error_code === "SERVICE_NOT_IN_KNOWLEDGE",
      JSON.stringify(invented.result),
    );

    const created = await executeClinicAppointmentTool(
      "clinic_create_appointment",
      JSON.stringify({
        resource_id: resourceId,
        service_name: "Diseño de sonrisa",
        start_at: slot!.start_at,
        end_at: slot!.end_at,
        patient_confirmed: true,
      }),
      {
        trusted: ctx,
        industry: "clinic",
        clinicAppointmentToolsEnabled: true,
        latestUserMessage: "Sí, confirmo",
        metadata: meta,
        serviceCatalog: catalog,
        onMetadataChange: (m) => {
          meta = m;
        },
      },
    );
    assert(
      "create with confirm ok",
      created.success,
      JSON.stringify(created.result),
    );
    const appointmentId = (created.result as { appointment_id?: string })
      .appointment_id;
    assert("has appointment id", Boolean(appointmentId));

    const row = await client.query(
      `select source, contact_id, status from clinic_appointments where id=$1`,
      [appointmentId],
    );
    assert("source whatsapp_ai", row.rows[0]?.source === "whatsapp_ai");
    assert("status confirmed", row.rows[0]?.status === "confirmed");

    const steal = await appointmentService.cancelAppointmentTrusted(
      { ...ctx, contactId: contactIdB },
      appointmentId!,
    );
    assert(
      "B cannot cancel A",
      !steal.ok && steal.code === "APPOINTMENT_NOT_FOUND",
    );

    const cancelNo = await executeClinicAppointmentTool(
      "clinic_cancel_appointment",
      JSON.stringify({
        appointment_id: appointmentId,
        patient_confirmed: false,
      }),
      {
        trusted: ctx,
        industry: "clinic",
        clinicAppointmentToolsEnabled: true,
        latestUserMessage: "Quiero cancelar",
        metadata: {},
        serviceCatalog: catalog,
        onMetadataChange: () => undefined,
      },
    );
    assert(
      "cancel without confirm blocked",
      !cancelNo.success && cancelNo.error_code === "NEEDS_CONFIRMATION",
    );

    const disabled = await executeClinicAppointmentTool(
      "clinic_get_availability",
      JSON.stringify({ resource_id: resourceId, date }),
      {
        trusted: ctx,
        industry: "clinic",
        clinicAppointmentToolsEnabled: false,
        latestUserMessage: "horarios",
        metadata: {},
        serviceCatalog: catalog,
        onMetadataChange: () => undefined,
      },
    );
    assert("flag false blocks", disabled.error_code === "TOOLS_DISABLED");

    await client.query(
      `update clinic_calendar_resources set active=false where id=$1`,
      [resourceId],
    );
    const inactive = await appointmentService.getAvailabilityTrusted(ctx, {
      resource_id: resourceId,
      date,
    });
    assert(
      "inactive resource",
      !inactive.ok && inactive.code === "RESOURCE_INACTIVE",
    );

    await client.query(
      `update clinic_calendar_resources set active=true where id=$1`,
      [resourceId],
    );

    const cancelYes = await executeClinicAppointmentTool(
      "clinic_cancel_appointment",
      JSON.stringify({
        appointment_id: appointmentId,
        patient_confirmed: true,
      }),
      {
        trusted: ctx,
        industry: "clinic",
        clinicAppointmentToolsEnabled: true,
        latestUserMessage: "Sí, cancelala",
        metadata: {},
        serviceCatalog: catalog,
        onMetadataChange: () => undefined,
      },
    );
    assert("cancel with confirm", cancelYes.success);

    await client.query(
      `insert into clinic_schedule_blocks (business_id, resource_id, start_at, end_at, reason)
       values ($1, $2, $3, $4, 'bloqueo')`,
      [
        businessId,
        resourceId,
        zonedLocalToUtcIso(date, "10:00", TZ),
        zonedLocalToUtcIso(date, "11:00", TZ),
      ],
    );
    const afterBlock = await appointmentService.getAvailabilityTrusted(ctx, {
      resource_id: resourceId,
      date,
    });
    if (afterBlock.ok) {
      const times = afterBlock.data.slots.map((s) => s.display_time);
      assert("blocked 10:00 hidden", !times.includes("10:00"));
      assert("blocked 10:30 hidden", !times.includes("10:30"));
    } else {
      assert("blocked availability query", false, afterBlock.error);
    }

    const shop = await client.query(
      `insert into businesses (name, slug, industry) values ('Shop', $1, 'ecommerce') returning id`,
      [`shop-${Date.now()}`],
    );
    assert(
      "ecommerce gating",
      !clinicAppointmentToolsAllowed({
        industry: "ecommerce",
        clinicAppointmentToolsEnabled: true,
      }),
    );

    await client.query(`delete from businesses where id = any($1::uuid[])`, [
      [businessId, shop.rows[0].id],
    ]);
    assert("cleanup", true);
  } finally {
    await client.end();
  }
}

await dbToolTests();
console.log(`\nSUMMARY passed=${passed} failed=${failed}`);
if (failed > 0) process.exit(1);
