export const CONVERSATIONS_LIST_LIMIT = 50;
export const CONVERSATION_MESSAGES_LIMIT = 200;
export const MESSAGE_PREVIEW_MAX = 80;

const MONTHS_ES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

const TYPE_LABELS: Record<string, string> = {
  image: "Imagen",
  audio: "Audio",
  voice: "Audio",
  video: "Video",
  document: "Documento",
  sticker: "Sticker",
  location: "Ubicación",
  contacts: "Contacto",
  template: "Plantilla",
  interactive: "Mensaje interactivo",
  button: "Respuesta de botón",
  reaction: "Reacción",
};

/**
 * Hoy solo el agente IA (real o harness) persiste salientes de tipo "text";
 * las campañas guardan "template" y el webhook solo guarda entrantes.
 */
export function isAiMessage(direction: string, type: string): boolean {
  return direction === "outbound" && type === "text";
}

/** Mensajes del harness de pruebas: nunca se enviaron por WhatsApp. */
export function isSimulationMessage(harness: unknown): boolean {
  return harness === true || harness === "true";
}

export function messageDisplayText(body: string | null, type: string): string {
  const text = body?.trim();
  if (text) return text;
  return TYPE_LABELS[type] ?? `Mensaje (${type})`;
}

export function messagePreview(body: string | null, type: string | null): string {
  if (!type && !body) return "Sin mensajes";
  const text = messageDisplayText(body, type ?? "text").replace(/\s+/g, " ");
  return text.length > MESSAGE_PREVIEW_MAX
    ? `${text.slice(0, MESSAGE_PREVIEW_MAX - 1)}…`
    : text;
}

type DateParts = { year: number; month: number; day: number; hour: string; minute: string };

function zonedParts(iso: string, timeZone: string): DateParts | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  };
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", { ...options, timeZone }).formatToParts(date);
  } catch {
    parts = new Intl.DateTimeFormat("en-CA", { ...options, timeZone: "UTC" }).formatToParts(date);
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** "2026-09-15" en la zona del negocio; agrupa mensajes por día. */
export function messageDayKey(iso: string, timeZone: string): string {
  const p = zonedParts(iso, timeZone);
  if (!p) return "";
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** "15 sep 2026". */
export function formatDayLabel(iso: string, timeZone: string): string {
  const p = zonedParts(iso, timeZone);
  if (!p) return "—";
  return `${p.day} ${MONTHS_ES[p.month - 1]} ${p.year}`;
}

/** "14:05". */
export function formatMessageTime(iso: string, timeZone: string): string {
  const p = zonedParts(iso, timeZone);
  if (!p) return "";
  return `${p.hour}:${p.minute}`;
}

/** Lista: hora si es hoy, "15 sep" si es este año, "15 sep 2025" si no. */
export function formatListTimestamp(
  iso: string | null,
  timeZone: string,
  now: Date = new Date(),
): string {
  if (!iso) return "";
  const p = zonedParts(iso, timeZone);
  const today = zonedParts(now.toISOString(), timeZone);
  if (!p || !today) return "";
  if (p.year === today.year && p.month === today.month && p.day === today.day) {
    return `${p.hour}:${p.minute}`;
  }
  const dayMonth = `${p.day} ${MONTHS_ES[p.month - 1]}`;
  return p.year === today.year ? dayMonth : `${dayMonth} ${p.year}`;
}
