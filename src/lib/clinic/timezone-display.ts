const TZ_LABELS: Record<string, string> = {
  "America/Argentina/Tucuman": "Argentina / Tucumán",
  "America/Argentina/Buenos_Aires": "Argentina / Buenos Aires",
  "America/Caracas": "Venezuela / Caracas",
  "America/Bogota": "Colombia / Bogotá",
  "America/Mexico_City": "México / Ciudad de México",
  "America/New_York": "EE.UU. / Nueva York",
  UTC: "UTC",
};

export function formatTimezoneLabel(timeZone: string): string {
  if (TZ_LABELS[timeZone]) return TZ_LABELS[timeZone];
  const parts = timeZone.split("/");
  if (parts.length >= 2) {
    return `${parts[parts.length - 2]?.replaceAll("_", " ")} / ${parts[
      parts.length - 1
    ]?.replaceAll("_", " ")}`;
  }
  return timeZone;
}

export function formatInBusinessTimeZone(
  iso: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  },
): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone,
    ...options,
  }).format(new Date(iso));
}

export function formatSlotClock(
  iso: string,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function formatAppointmentRange(
  startIso: string,
  endIso: string,
  timeZone: string,
): string {
  const date = formatInBusinessTimeZone(startIso, timeZone, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const start = formatSlotClock(startIso, timeZone);
  const end = formatSlotClock(endIso, timeZone);
  return `${date} · ${start}–${end}`;
}
