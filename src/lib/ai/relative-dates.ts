import { zonedLocalToUtcIso, getWeekdayInTimeZone } from "@/lib/clinic/datetime";

/**
 * Resuelve fechas relativas en business.timezone → YYYY-MM-DD.
 * Devuelve null si es ambiguo.
 */
export function resolveRelativeDate(
  expression: string,
  timeZone: string,
  now: Date = new Date(),
): string | null {
  const raw = expression.trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const todayYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hourCycle: "h23",
  }).format(now);

  const addDays = (ymd: string, days: number): string => {
    const base = new Date(zonedLocalToUtcIso(ymd, "12:00", timeZone));
    base.setUTCDate(base.getUTCDate() + days);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hourCycle: "h23",
    }).format(base);
  };

  if (/^(hoy|today)$/.test(raw)) return todayYmd;
  if (/^(mañana|manana|tomorrow)$/.test(raw)) return addDays(todayYmd, 1);
  if (/^(pasado\s*mañana|pasado\s*manana)$/.test(raw)) {
    return addDays(todayYmd, 2);
  }

  const weekdayMap: Record<string, number> = {
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

  const weekMatch = raw.match(
    /^(este|el|la\s+pr[oó]xima?\s+semana\s+el|pr[oó]xim[oa])?\s*(domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado)$/,
  );
  if (weekMatch) {
    const dayName = weekMatch[2]!.normalize("NFD").replace(/\p{M}/gu, "");
    const normalized =
      dayName === "miercoles"
        ? "miercoles"
        : dayName === "sabado"
          ? "sabado"
          : dayName;
    const target =
      weekdayMap[weekMatch[2]!] ??
      weekdayMap[normalized] ??
      weekdayMap[dayName];
    if (target === undefined) return null;

    const todayWd = getWeekdayInTimeZone(todayYmd, timeZone);
    let delta = (target - todayWd + 7) % 7;
    if (delta === 0) delta = 7; // "el lunes" → próximo lunes (no hoy si hoy es lunes? )
    // If today is that weekday and user said "hoy" they'd use hoy; "el lunes" usually next occurrence including today if still morning — use next including today:
    delta = (target - todayWd + 7) % 7;
    if (
      /pr[oó]xim/.test(raw) &&
      delta === 0
    ) {
      delta = 7;
    }
    return addDays(todayYmd, delta === 0 ? 0 : delta);
  }

  if (/otro\s+viernes|el\s+otro/.test(raw)) return null;

  return null;
}
