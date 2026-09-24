import type { AppointmentIntentState } from "@/lib/ai/appointment-intent";

export type OfferedSlot = {
  start_at: string;
  end_at: string;
  display_time: string;
};

export type SlotSelectionResult =
  | { status: "selected"; slot: OfferedSlot }
  | { status: "ambiguous"; candidates: OfferedSlot[] }
  | { status: "not_in_offered"; requested: string }
  | { status: "no_match" }
  | { status: "no_slots" };

function normalize(message: string): string {
  return message
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** "10:00" | "10" | "9:30" → { hour, minute } */
function parseClockToken(
  raw: string,
): { hour: number; minute: number } | null {
  const m = raw.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = m[2] !== undefined ? Number(m[2]) : 0;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function displayToClock(
  displayTime: string,
): { hour: number; minute: number } | null {
  const cleaned = normalize(displayTime).replace(/\s*(hs|hrs?|h)\s*$/i, "");
  return parseClockToken(cleaned);
}

function clocksEqual(
  a: { hour: number; minute: number },
  b: { hour: number; minute: number },
): boolean {
  return a.hour === b.hour && a.minute === b.minute;
}

/**
 * Extrae un horario candidato del mensaje del paciente.
 * Ej: "10:00", "10", "a las 10", "el de las 10", "prefiero 10:00", "mejor 11:00"
 */
export function extractRequestedClock(
  message: string,
): { hour: number; minute: number; raw: string; minuteExplicit: boolean } | null {
  const text = normalize(message);
  if (!text) return null;

  // HH:MM primero
  const withMinutes = text.match(
    /\b(?:a\s+las\s+|el\s+de\s+las\s+|prefiero\s+|mejor\s+|el\s+)?(\d{1,2}:\d{2})\b/,
  );
  if (withMinutes?.[1]) {
    const clock = parseClockToken(withMinutes[1]);
    if (clock) {
      return { ...clock, raw: withMinutes[1], minuteExplicit: true };
    }
  }

  // Solo hora: "10", "a las 10", "el de las 10"
  const hourOnly = text.match(
    /\b(?:a\s+las\s+|el\s+de\s+las\s+|prefiero\s+|mejor\s+|el\s+)?(\d{1,2})\b(?!\s*:)/,
  );
  if (hourOnly?.[1]) {
    const clock = parseClockToken(hourOnly[1]);
    if (clock) {
      return { ...clock, raw: hourOnly[1], minuteExplicit: false };
    }
  }

  return null;
}

/**
 * Resuelve la selección del paciente contra offered_slots reales.
 * start_at/end_at SIEMPRE salen del slot ofrecido, nunca del LLM.
 */
export function resolveOfferedSlotSelection(
  message: string,
  offeredSlots: OfferedSlot[] | undefined,
): SlotSelectionResult {
  if (!offeredSlots || offeredSlots.length === 0) {
    return { status: "no_slots" };
  }

  const requested = extractRequestedClock(message);
  if (!requested) {
    return { status: "no_match" };
  }

  const withClock = offeredSlots
    .map((slot) => ({ slot, clock: displayToClock(slot.display_time) }))
    .filter(
      (x): x is { slot: OfferedSlot; clock: { hour: number; minute: number } } =>
        x.clock !== null,
    );

  if (requested.minuteExplicit) {
    const exact = withClock.filter((x) => clocksEqual(x.clock, requested));
    if (exact.length === 1) {
      return { status: "selected", slot: exact[0]!.slot };
    }
    if (exact.length > 1) {
      return {
        status: "ambiguous",
        candidates: exact.map((x) => x.slot),
      };
    }
    return { status: "not_in_offered", requested: requested.raw };
  }

  // Hora sin minutos: "10" → solo slots de esa hora; si hay varios (10:00 y 10:30) = ambiguo;
  // si solo hay 10:00 = selected.
  const sameHour = withClock.filter((x) => x.clock.hour === requested.hour);
  if (sameHour.length === 0) {
    return { status: "not_in_offered", requested: requested.raw };
  }
  if (sameHour.length === 1) {
    return { status: "selected", slot: sameHour[0]!.slot };
  }
  // Prefer :00 if present and message was bare hour? User said no ambiguity — if both exist, ambiguous.
  return {
    status: "ambiguous",
    candidates: sameHour.map((x) => x.slot),
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/**
 * Nunca aceptar resource_name como resource_id.
 * Si el modelo pasa un nombre, reutilizar UUID persistido en intent.
 */
export function resolveResourceIdFromArgs(input: {
  argResourceId: string | null | undefined;
  intent: AppointmentIntentState | undefined;
}): { ok: true; resource_id: string } | { ok: false; code: string; error: string } {
  const raw = (input.argResourceId ?? "").trim();
  if (isUuid(raw)) {
    return { ok: true, resource_id: raw };
  }
  const fromIntent = input.intent?.resource_id?.trim() ?? "";
  if (isUuid(fromIntent)) {
    return { ok: true, resource_id: fromIntent };
  }
  if (raw) {
    return {
      ok: false,
      code: "INVALID_RESOURCE_ID",
      error:
        "resource_id debe ser el UUID del profesional (no el nombre). Usa clinic_list_resources y el id devuelto.",
    };
  }
  return {
    ok: false,
    code: "MISSING_RESOURCE",
    error: "Falta resource_id.",
  };
}

/** True si start/end coinciden exactamente con un offered_slot. */
export function slotMatchesOffered(
  startAt: string,
  endAt: string,
  offeredSlots: OfferedSlot[] | undefined,
): boolean {
  if (!offeredSlots?.length) return false;
  return offeredSlots.some((s) => s.start_at === startAt && s.end_at === endAt);
}
