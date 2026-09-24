import { normalizeText } from "@/lib/ai/knowledge-retrieval";
import type { AiKnowledgeEntry } from "@/types/ai-agent";

export type ServiceResolveStatus =
  | "resolved"
  | "ambiguous"
  | "not_found"
  | "no_booking_intent";

export type ServiceResolveResult =
  | {
      status: "resolved";
      service_name: string;
      catalog: string[];
      booking_intent: true;
    }
  | {
      status: "ambiguous";
      candidates: string[];
      catalog: string[];
      booking_intent: true;
    }
  | {
      status: "not_found";
      catalog: string[];
      booking_intent: true;
      requested_raw: string | null;
    }
  | {
      status: "no_booking_intent";
      catalog: string[];
      booking_intent: false;
    };

/** Aliases gated by catalog presence — never invent services absent from Knowledge. */
const SOFT_ALIASES: Array<{ pattern: RegExp; targetNormalized: string }> = [
  {
    pattern: /\b(rinomodelaci[oó]n|rinomodelarme|rinomodelar|nariz)\b/i,
    targetNormalized: "rinomodelacion",
  },
  {
    pattern: /\b(armon[ií]a labial|labios?|labial)\b/i,
    targetNormalized: "armonia labial",
  },
  {
    pattern: /\b(contorno mandibular|mand[ií]bula)\b/i,
    targetNormalized: "contorno mandibular",
  },
  {
    pattern: /\b(armonizaci[oó]n facial)\b/i,
    targetNormalized: "armonizacion facial",
  },
  {
    pattern: /\b(hifu|ultrasonido focalizado)\b/i,
    targetNormalized: "hifu",
  },
  {
    pattern: /\b(bioestimuladores?( de col[aá]geno)?|col[aá]geno)\b/i,
    targetNormalized: "bioestimuladores de colageno",
  },
  {
    pattern: /\b(toxina botul[ií]nica|botox|botul[ií]nica)\b/i,
    targetNormalized: "toxina botulinica",
  },
];

const BOOKING_INTENT_RE =
  /\b(cita|citas|turno|turnos|reservar|reserva|agendar|agenda|sacar\s+turno|quiero\s+(una\s+)?cita|necesito\s+(una\s+)?cita|hacerme|me\s+quiero\s+hacer)\b/i;

/**
 * Extrae nombres de tratamientos/servicios listados en Knowledge (bullets, etc.).
 * No crea catálogo aparte: Knowledge es la fuente de verdad.
 */
export function extractServiceCatalogFromKnowledge(
  entries: AiKnowledgeEntry[],
): string[] {
  const found = new Map<string, string>();

  for (const entry of entries) {
    const prefer =
      entry.category === "productos" ||
      /tratamiento|servicio|procedimiento|productos/i.test(entry.title);

    const lines = entry.content.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      const bullet = line.match(/^[-*•]\s+(.+)$/);
      const numbered = line.match(/^\d+[.)]\s+(.+)$/);
      const candidate = (bullet?.[1] ?? numbered?.[1] ?? "").trim();
      if (!candidate) continue;

      // Skip instructional meta-lines inside knowledge.
      if (
        /^(el agente|la elecci[oó]n|no existe|informar|explicar|ayudar|indicar|diagnosticar|recomendar|garantizar)/i.test(
          candidate,
        )
      ) {
        continue;
      }

      const canonical = stripServiceDecorations(candidate);
      if (canonical.length < 3) continue;
      // Prefer titles from productos / tratamientos entries; still accept bullets elsewhere.
      if (!prefer && canonical.split(/\s+/).length > 6) continue;

      const key = normalizeText(canonical);
      if (!found.has(key)) found.set(key, canonical);
    }
  }

  return [...found.values()].sort((a, b) => a.localeCompare(b, "es"));
}

function stripServiceDecorations(value: string): string {
  // "HIFU (ultrasonido focalizado)" → prefer short canonical when paren is descriptive
  const withParen = value.match(/^(.+?)\s*\((.+)\)\s*$/);
  if (withParen) {
    const head = withParen[1]!.trim();
    if (head.length >= 2 && head.length <= 40) return head;
  }
  return value.replace(/\s+/g, " ").trim();
}

export function detectBookingIntent(message: string): boolean {
  return BOOKING_INTENT_RE.test(message);
}

function findCatalogMatch(
  catalog: string[],
  normalizedTarget: string,
): string | null {
  const exact = catalog.find((c) => normalizeText(c) === normalizedTarget);
  if (exact) return exact;

  const starts = catalog.filter(
    (c) =>
      normalizeText(c).startsWith(normalizedTarget) ||
      normalizedTarget.startsWith(normalizeText(c)),
  );
  if (starts.length === 1) return starts[0]!;

  const includes = catalog.filter(
    (c) =>
      normalizeText(c).includes(normalizedTarget) ||
      normalizedTarget.includes(normalizeText(c)),
  );
  if (includes.length === 1) return includes[0]!;
  return null;
}

function scoreAgainstCatalog(queryNorm: string, serviceName: string): number {
  const serviceNorm = normalizeText(serviceName);
  if (!queryNorm || !serviceNorm) return 0;
  if (queryNorm.includes(serviceNorm) || serviceNorm.includes(queryNorm)) {
    return 10;
  }

  const qTokens = queryNorm.split(/\s+/).filter((t) => t.length >= 3);
  const sTokens = serviceNorm.split(/\s+/).filter((t) => t.length >= 3);
  if (qTokens.length === 0 || sTokens.length === 0) return 0;

  let hits = 0;
  for (const qt of qTokens) {
    if (
      sTokens.some(
        (st) =>
          st === qt ||
          (st.length >= 5 && qt.length >= 5 && (st.startsWith(qt) || qt.startsWith(st))),
      )
    ) {
      hits += 1;
    }
  }
  return hits * 2;
}

/**
 * Resuelve el tratamiento solicitado contra Knowledge.
 * AppointmentService NO interviene aquí.
 */
export function resolveServiceFromKnowledge(input: {
  userMessage: string;
  knowledgeEntries: AiKnowledgeEntry[];
}): ServiceResolveResult {
  const catalog = extractServiceCatalogFromKnowledge(input.knowledgeEntries);
  const booking = detectBookingIntent(input.userMessage);

  if (!booking) {
    return { status: "no_booking_intent", catalog, booking_intent: false };
  }

  const msg = input.userMessage.trim();
  const msgNorm = normalizeText(msg);

  // Soft aliases only if the target exists in catalog.
  for (const alias of SOFT_ALIASES) {
    if (!alias.pattern.test(msg)) continue;
    const match = findCatalogMatch(catalog, alias.targetNormalized);
    if (match) {
      return {
        status: "resolved",
        service_name: match,
        catalog,
        booking_intent: true,
      };
    }
  }

  // Direct catalog scoring from the message.
  const scored = catalog
    .map((name) => ({ name, score: scoreAgainstCatalog(msgNorm, name) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "es"));

  if (scored.length === 0) {
    return {
      status: "not_found",
      catalog,
      booking_intent: true,
      requested_raw: msg,
    };
  }

  if (
    scored.length >= 2 &&
    scored[0]!.score === scored[1]!.score &&
    scored[0]!.score < 10
  ) {
    return {
      status: "ambiguous",
      candidates: scored.slice(0, 4).map((s) => s.name),
      catalog,
      booking_intent: true,
    };
  }

  if (scored[0]!.score >= 2) {
    return {
      status: "resolved",
      service_name: scored[0]!.name,
      catalog,
      booking_intent: true,
    };
  }

  return {
    status: "not_found",
    catalog,
    booking_intent: true,
    requested_raw: msg,
  };
}

/** Valida que un service_name propuesto exista en Knowledge (match exacto normalizado). */
export function isKnownServiceName(
  serviceName: string,
  catalog: string[],
): boolean {
  const norm = normalizeText(serviceName.trim());
  if (!norm) return false;
  return catalog.some((c) => normalizeText(c) === norm);
}

export function formatServiceCatalogForPrompt(catalog: string[]): string {
  if (catalog.length === 0) {
    return "(Sin tratamientos listados en Knowledge.)";
  }
  return catalog.map((name) => `- ${name}`).join("\n");
}
