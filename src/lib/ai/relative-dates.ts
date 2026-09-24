import { zonedLocalToUtcIso, getWeekdayInTimeZone } from "@/lib/clinic/datetime";

const WEEKDAY_NAMES =
  "domingo|lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado";

const WEEKDAY_MAP: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  miércoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sábado: 6,
};

export type AppointmentDateResolveOk = {
  ok: true;
  date: string;
  source: "relative" | "absolute";
  expression: string | null;
};

export type AppointmentDateResolveFail = {
  ok: false;
  code: "DATE_AMBIGUOUS" | "INVALID_APPOINTMENT_DATE";
  error: string;
};

export type AppointmentDateResolveResult =
  | AppointmentDateResolveOk
  | AppointmentDateResolveFail;

/** YYYY-MM-DD de `now` en el timezone del business. */
export function todayYmdInTimeZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hourCycle: "h23",
  }).format(now);
}

export function addDaysYmd(
  ymd: string,
  days: number,
  timeZone: string,
): string {
  const base = new Date(zonedLocalToUtcIso(ymd, "12:00", timeZone));
  base.setUTCDate(base.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hourCycle: "h23",
  }).format(base);
}

/** true si dateYmd es anterior al día de hoy en timeZone (hoy NO es pasado). */
export function isPastAppointmentDate(
  dateYmd: string,
  timeZone: string,
  now: Date = new Date(),
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) return false;
  const today = todayYmdInTimeZone(timeZone, now);
  return dateYmd < today;
}

function normalizeExpression(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

/**
 * Resuelve SOLO expresiones relativas → YYYY-MM-DD en business.timezone.
 * NO acepta YYYY-MM-DD (eso va por la ruta de fecha absoluta validada).
 * Devuelve null si es ambiguo / no soportado.
 */
export function resolveRelativeDate(
  expression: string,
  timeZone: string,
  now: Date = new Date(),
): string | null {
  const raw = normalizeExpression(expression);
  if (!raw) return null;
  // Absolute dates are NOT resolved here — authority stays in resolveAppointmentDateInput.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;

  const todayYmd = todayYmdInTimeZone(timeZone, now);

  if (/^(hoy|today)$/.test(raw)) return todayYmd;
  if (/^(manana|tomorrow)$/.test(raw)) return addDaysYmd(todayYmd, 1, timeZone);
  if (/^(pasado\s*manana)$/.test(raw)) return addDaysYmd(todayYmd, 2, timeZone);

  // "el otro viernes" / ambiguos explícitos
  if (/\botro\b/.test(raw) || /la\s+otra\s+semana/.test(raw)) return null;

  // próximo|el próximo|este|el + weekday
  const weekMatch = raw.match(
    new RegExp(
      `^(?:(el\\s+)?proxim[oa]|este|el)?\\s*(${WEEKDAY_NAMES})$`,
    ),
  );
  if (weekMatch) {
    const dayToken = weekMatch[2]!.normalize("NFD").replace(/\p{M}/gu, "");
    const target = WEEKDAY_MAP[weekMatch[2]!] ?? WEEKDAY_MAP[dayToken];
    if (target === undefined) return null;

    const todayWd = getWeekdayInTimeZone(todayYmd, timeZone);
    let delta = (target - todayWd + 7) % 7;
    const wantsNext = /proxim/.test(raw);
    // "próximo lunes": si hoy es lunes → +7; si no, el próximo occurrence.
    if (wantsNext && delta === 0) delta = 7;
    // "este lunes" / "el lunes": incluye hoy si coincide el weekday.
    return addDaysYmd(todayYmd, delta, timeZone);
  }

  // "la próxima semana el lunes" (opcional)
  const nextWeekMatch = raw.match(
    new RegExp(
      `^la\\s+proxima\\s+semana\\s+(el\\s+)?(${WEEKDAY_NAMES})$`,
    ),
  );
  if (nextWeekMatch) {
    const dayToken = nextWeekMatch[2]!.normalize("NFD").replace(/\p{M}/gu, "");
    const target = WEEKDAY_MAP[nextWeekMatch[2]!] ?? WEEKDAY_MAP[dayToken];
    if (target === undefined) return null;
    const todayWd = getWeekdayInTimeZone(todayYmd, timeZone);
    let delta = (target - todayWd + 7) % 7;
    if (delta === 0) delta = 7;
    delta += 7; // week after the upcoming occurrence
    return addDaysYmd(todayYmd, delta, timeZone);
  }

  return null;
}

/**
 * Extrae una expresión relativa del mensaje del paciente (si es segura).
 * Prioriza frases más específicas ("el próximo lunes" antes que "mañana").
 * No confunde "por la mañana" (franja) con "mañana" (día siguiente).
 */
export function extractRelativeDateExpression(message: string): string | null {
  const raw = normalizeExpression(message);
  if (!raw) return null;

  const patterns: RegExp[] = [
    new RegExp(`\\bel\\s+proxim[oa]\\s+(${WEEKDAY_NAMES})\\b`),
    new RegExp(`\\bproxim[oa]\\s+(${WEEKDAY_NAMES})\\b`),
    new RegExp(`\\beste\\s+(${WEEKDAY_NAMES})\\b`),
    new RegExp(`\\bel\\s+(${WEEKDAY_NAMES})\\b`),
    new RegExp(`\\b(${WEEKDAY_NAMES})\\b`),
    /\bpasado\s*manana\b/,
    // "mañana" día siguiente — no "por/de la mañana" (franja horaria)
    /(?<!por la )(?<!de la )(?<!a la )\bmanana\b/,
    /\bhoy\b/,
    /\btoday\b/,
    /\btomorrow\b/,
  ];

  for (const pattern of patterns) {
    const m = raw.match(pattern);
    if (m?.[0]) return m[0].trim();
  }
  return null;
}

/**
 * Autoridad server-side para fechas de cita.
 * El LLM NO debe ser la fuente final de YYYY-MM-DD relativos.
 */
export function resolveAppointmentDateInput(input: {
  /** YYYY-MM-DD solo si el paciente dio fecha absoluta; o expresión relativa (legacy). */
  date?: string | null;
  /** Frase temporal del paciente (preferido para relativos). */
  date_expression?: string | null;
  /** Mensaje del paciente: red de seguridad si el modelo inventó un YYYY-MM-DD. */
  latestUserMessage?: string | null;
  timeZone: string;
  now?: Date;
}): AppointmentDateResolveResult {
  const now = input.now ?? new Date();
  const timeZone = input.timeZone;

  const finishRelative = (
    expr: string,
    resolved: string,
  ): AppointmentDateResolveResult => {
    if (isPastAppointmentDate(resolved, timeZone, now)) {
      return {
        ok: false,
        code: "INVALID_APPOINTMENT_DATE",
        error:
          "La fecha resuelta ya pasó. Pide al paciente otro día futuro.",
      };
    }
    return {
      ok: true,
      date: resolved,
      source: "relative",
      expression: expr,
    };
  };

  // 1) date_expression explícita: si no resuelve → DATE_AMBIGUOUS (sin inventar).
  const explicitExpr = input.date_expression?.trim();
  if (explicitExpr && !/^\d{4}-\d{2}-\d{2}$/.test(explicitExpr)) {
    const resolved = resolveRelativeDate(explicitExpr, timeZone, now);
    if (resolved) return finishRelative(explicitExpr, resolved);
    return {
      ok: false,
      code: "DATE_AMBIGUOUS",
      error:
        "No pude interpretar date_expression de forma segura. Pide al paciente un día concreto (ej. el lunes o 2026-09-28).",
    };
  }

  // 2) `date` como expresión relativa (no YYYY-MM-DD)
  const dateArg = input.date?.trim() ?? "";
  if (dateArg && !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
    const resolved = resolveRelativeDate(dateArg, timeZone, now);
    if (resolved) return finishRelative(dateArg, resolved);
    return {
      ok: false,
      code: "DATE_AMBIGUOUS",
      error:
        "No pude interpretar la fecha de forma segura. Pide al paciente un día concreto.",
    };
  }

  // 3) Red de seguridad: expresión relativa en el mensaje del paciente
  //    (cubre LLM que inventó YYYY-MM-DD incorrecto, p.ej. 2023-09-25).
  const fromMessage = extractRelativeDateExpression(
    input.latestUserMessage ?? "",
  );
  if (fromMessage) {
    const resolved = resolveRelativeDate(fromMessage, timeZone, now);
    if (resolved) return finishRelative(fromMessage, resolved);
  }
  if (/\botro\b/.test(normalizeExpression(input.latestUserMessage ?? ""))) {
    return {
      ok: false,
      code: "DATE_AMBIGUOUS",
      error:
        "La fecha es ambigua. Pide al paciente aclarar el día concreto.",
    };
  }

  // 4) Absolute YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
    if (isPastAppointmentDate(dateArg, timeZone, now)) {
      return {
        ok: false,
        code: "INVALID_APPOINTMENT_DATE",
        error:
          "La fecha solicitada ya pasó. No se consulta disponibilidad histórica. Pide una fecha futura o una expresión relativa (ej. próximo lunes).",
      };
    }
    return {
      ok: true,
      date: dateArg,
      source: "absolute",
      expression: null,
    };
  }

  return {
    ok: false,
    code: "DATE_AMBIGUOUS",
    error:
      "Falta fecha. Pasa date_expression con las palabras del paciente (hoy, mañana, el próximo lunes) o date YYYY-MM-DD solo si el paciente la dio explícita.",
  };
}
