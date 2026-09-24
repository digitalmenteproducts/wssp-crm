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

const { isAffirmativeConfirmation } = await import("../src/lib/ai/confirmation");
const { resolveRelativeDate } = await import("../src/lib/ai/relative-dates");
const {
  clinicAppointmentToolsAllowed,
  executeClinicAppointmentTool,
} = await import("../src/services/ai/clinic-appointment-tools");
const appointmentService = await import(
  "../src/services/clinic/appointment.service"
);
const { zonedLocalToUtcIso } = await import("../src/lib/clinic/datetime");

const TZ = "America/Argentina/Tucuman";
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

{
  const now = new Date("2026-09-23T18:00:00.000Z");
  assert(
    "mañana",
    resolveRelativeDate("mañana", TZ, now) === "2026-09-24",
    resolveRelativeDate("mañana", TZ, now) ?? "",
  );
  assert("hoy", resolveRelativeDate("hoy", TZ, now) === "2026-09-23");
  const lunes = resolveRelativeDate("lunes", TZ, now);
  assert("lunes futuro", lunes === "2026-09-28", lunes ?? "");
  assert(
    "ambiguo null",
    resolveRelativeDate("el otro viernes", TZ, now) === null,
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
        "Pastore tools remain false",
        pastoreFlag.rows[0].clinic_appointment_tools_enabled === false,
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

    let meta = {};
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
        onMetadataChange: (m) => {
          meta = m;
        },
      },
    );
    assert(
      "create without confirm blocked",
      !noConfirm.success && noConfirm.error_code === "NEEDS_CONFIRMATION",
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
