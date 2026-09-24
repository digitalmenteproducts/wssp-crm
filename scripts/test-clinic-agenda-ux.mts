/**
 * Tests UX / validaciones Agenda Clinic.
 * Uso: npx tsx scripts/test-clinic-agenda-ux.mts
 */
import {
  CLINIC_ERROR_MESSAGES,
  clinicErrorMessage,
  mapTechnicalError,
} from "../src/lib/clinic/errors";
import {
  formatTimezoneLabel,
  formatSlotClock,
} from "../src/lib/clinic/timezone-display";
import {
  zonedLocalToUtcIso,
  getWeekdayInTimeZone,
  utcIsoToDateYmd,
} from "../src/lib/clinic/datetime";
import {
  computeAvailabilitySlots,
  isSlotFree,
} from "../src/services/clinic/internal-calendar.provider";

const TZ = "America/Argentina/Tucuman";
const TZ_VE = "America/Caracas";

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

// Error mapping
assert(
  "overlap maps to APPOINTMENT_OVERLAP",
  mapTechnicalError("clinic_appointments_no_overlap").code ===
    "APPOINTMENT_OVERLAP",
);
assert(
  "overlap message user-friendly",
  mapTechnicalError("exclusion constraint").error ===
    CLINIC_ERROR_MESSAGES.APPOINTMENT_OVERLAP,
);
assert(
  "missing contact message",
  clinicErrorMessage("MISSING_CONTACT") === "Selecciona un paciente.",
);
assert(
  "no weekly message",
  clinicErrorMessage("NO_WEEKLY_AVAILABILITY").includes("disponibilidad"),
);

// Timezone label
assert(
  "Tucuman label",
  formatTimezoneLabel("America/Argentina/Tucuman").includes("Tucumán"),
);

// Business TZ independent of "browser" (simulate VE admin booking ART clinic)
{
  const startArt = zonedLocalToUtcIso("2026-09-28", "10:00", TZ);
  const endArt = zonedLocalToUtcIso("2026-09-28", "10:30", TZ);
  // Same wall clock in Caracas would be different UTC:
  const startVe = zonedLocalToUtcIso("2026-09-28", "10:00", TZ_VE);
  assert(
    "business TZ != browser TZ produces different UTC",
    startArt !== startVe,
    `${startArt} vs ${startVe}`,
  );
  assert(
    "slot clock shows 10:00 in ART",
    formatSlotClock(startArt, TZ) === "10:00",
    formatSlotClock(startArt, TZ),
  );
  assert(
    "date YMD roundtrip ART",
    utcIsoToDateYmd(startArt, TZ) === "2026-09-28",
  );
  assert("end auto 30min", endArt === zonedLocalToUtcIso("2026-09-28", "10:30", TZ));
}

// 30 min slots exclude occupied + blocked
{
  // Monday 2026-09-28
  assert("2026-09-28 is Monday", getWeekdayInTimeZone("2026-09-28", TZ) === 1);
  const weekly = [
    {
      id: "1",
      business_id: "b",
      resource_id: "r",
      day_of_week: 1,
      start_time: "09:00:00",
      end_time: "13:00:00",
      slot_duration_minutes: 30,
      active: true,
      created_at: "",
      updated_at: "",
    },
  ];
  const slots = computeAvailabilitySlots({
    date: "2026-09-28",
    timeZone: TZ,
    durationMinutes: 30,
    weekly,
    appointments: [
      {
        start_at: zonedLocalToUtcIso("2026-09-28", "09:30", TZ),
        end_at: zonedLocalToUtcIso("2026-09-28", "10:00", TZ),
        status: "confirmed",
      },
    ],
    blocks: [
      {
        start_at: zonedLocalToUtcIso("2026-09-28", "11:00", TZ),
        end_at: zonedLocalToUtcIso("2026-09-28", "12:00", TZ),
      },
    ],
  });
  const clocks = slots.map((s) => formatSlotClock(s.start_at, TZ));
  assert("excludes occupied 09:30", !clocks.includes("09:30"));
  assert("excludes blocked 11:00", !clocks.includes("11:00"));
  assert("excludes blocked 11:30", !clocks.includes("11:30"));
  assert("includes 09:00", clocks.includes("09:00"));
  assert("includes 10:00", clocks.includes("10:00"));
  assert("includes 12:00", clocks.includes("12:00"));
}

// 60 min slots
{
  const weekly = [
    {
      id: "1",
      business_id: "b",
      resource_id: "r",
      day_of_week: 1,
      start_time: "09:00:00",
      end_time: "12:00:00",
      slot_duration_minutes: 60,
      active: true,
      created_at: "",
      updated_at: "",
    },
  ];
  const slots = computeAvailabilitySlots({
    date: "2026-09-28",
    timeZone: TZ,
    durationMinutes: 60,
    weekly,
    appointments: [],
    blocks: [],
  });
  const clocks = slots.map((s) => formatSlotClock(s.start_at, TZ));
  assert("60min slots 09,10,11", clocks.join(",") === "09:00,10:00,11:00", clocks.join(","));
}

// Day without weekly
{
  const weekly = [
    {
      id: "1",
      business_id: "b",
      resource_id: "r",
      day_of_week: 1,
      start_time: "09:00:00",
      end_time: "12:00:00",
      slot_duration_minutes: 30,
      active: true,
      created_at: "",
      updated_at: "",
    },
  ];
  // Thursday
  const slots = computeAvailabilitySlots({
    date: "2026-10-01",
    timeZone: TZ,
    durationMinutes: 30,
    weekly,
    appointments: [],
    blocks: [],
  });
  assert("no slots without weekly day", slots.length === 0);
  assert("Thursday weekday", getWeekdayInTimeZone("2026-10-01", TZ) === 4);
}

// Overlap / free
{
  const existing = [
    {
      id: "a",
      start_at: zonedLocalToUtcIso("2026-09-28", "10:00", TZ),
      end_at: zonedLocalToUtcIso("2026-09-28", "11:00", TZ),
      status: "confirmed" as const,
    },
  ];
  assert(
    "overlap blocked",
    !isSlotFree({
      startAt: zonedLocalToUtcIso("2026-09-28", "10:30", TZ),
      endAt: zonedLocalToUtcIso("2026-09-28", "11:30", TZ),
      appointments: existing,
      blocks: [],
    }),
  );
  assert(
    "block detected as busy",
    !isSlotFree({
      startAt: zonedLocalToUtcIso("2026-09-28", "12:00", TZ),
      endAt: zonedLocalToUtcIso("2026-09-28", "12:30", TZ),
      appointments: [],
      blocks: [
        {
          start_at: zonedLocalToUtcIso("2026-09-28", "12:00", TZ),
          end_at: zonedLocalToUtcIso("2026-09-28", "13:00", TZ),
        },
      ],
    }),
  );
}

console.log(`\nSUMMARY passed=${passed} failed=${failed}`);
if (failed > 0) process.exit(1);
