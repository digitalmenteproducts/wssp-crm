import { normalizeText } from "@/lib/ai/knowledge-retrieval";
import type { ClinicService } from "@/types/clinic";

export type ClinicServiceResolveStatus =
  | "resolved"
  | "ambiguous"
  | "not_found"
  | "inactive"
  | "requires_consultation"
  | "no_booking_intent";

export type ClinicServiceCatalogItem = {
  id: string;
  name: string;
  active: boolean;
  duration_minutes: number;
  requires_initial_consultation: boolean;
  initial_consultation_service_id: string | null;
};

export type ClinicServiceResolveResult =
  | {
      status: "resolved";
      service_id: string;
      service_name: string;
      duration_minutes: number;
      requires_initial_consultation: boolean;
      initial_consultation_service_id: string | null;
      catalog: ClinicServiceCatalogItem[];
      booking_intent: true;
    }
  | {
      status: "requires_consultation";
      service_id: string;
      service_name: string;
      consultation_service_id: string | null;
      consultation_service_name: string | null;
      catalog: ClinicServiceCatalogItem[];
      booking_intent: true;
    }
  | {
      status: "ambiguous";
      candidates: ClinicServiceCatalogItem[];
      catalog: ClinicServiceCatalogItem[];
      booking_intent: true;
    }
  | {
      status: "not_found";
      catalog: ClinicServiceCatalogItem[];
      booking_intent: true;
      requested_raw: string | null;
    }
  | {
      status: "inactive";
      service_id: string;
      service_name: string;
      catalog: ClinicServiceCatalogItem[];
      booking_intent: true;
    }
  | {
      status: "no_booking_intent";
      catalog: ClinicServiceCatalogItem[];
      booking_intent: false;
    };

/** Soft aliases — only apply if target exists in clinic_services catalog. */
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
    pattern: /\b(medicina est[eé]tica)\b/i,
    targetNormalized: "medicina estetica",
  },
  {
    pattern: /\b(plasma)\b/i,
    targetNormalized: "plasma",
  },
  {
    pattern: /\b(cosmiatr[ií]a)\b/i,
    targetNormalized: "cosmiatria",
  },
  {
    pattern: /\b(consulta( de)? valoraci[oó]n|valoraci[oó]n)\b/i,
    targetNormalized: "consulta de valoracion",
  },
  {
    pattern: /\b(hifu|ultrasonido focalizado)\b/i,
    targetNormalized: "hifu",
  },
  {
    pattern: /\b(toxina botul[ií]nica|botox|botul[ií]nica)\b/i,
    targetNormalized: "toxina botulinica",
  },
];

const BOOKING_INTENT_RE =
  /\b(cita|citas|turno|turnos|reservar|reserva|agendar|agenda|sacar\s+turno|quiero\s+(una\s+)?cita|necesito\s+(una\s+)?cita|hacerme|me\s+quiero\s+hacer)\b/i;

export function detectBookingIntent(message: string): boolean {
  return BOOKING_INTENT_RE.test(message);
}

export function toClinicServiceCatalog(
  services: ClinicService[],
): ClinicServiceCatalogItem[] {
  return services.map((s) => ({
    id: s.id,
    name: s.name,
    active: s.active,
    duration_minutes: s.duration_minutes,
    requires_initial_consultation: s.requires_initial_consultation,
    initial_consultation_service_id: s.initial_consultation_service_id,
  }));
}

function scoreAgainstName(msgNorm: string, serviceName: string): number {
  const nameNorm = normalizeText(serviceName);
  if (!msgNorm || !nameNorm) return 0;
  if (msgNorm.includes(nameNorm) || nameNorm.includes(msgNorm)) return 10;

  const stop = new Set([
    "de",
    "la",
    "el",
    "los",
    "las",
    "un",
    "una",
    "quiero",
    "cita",
    "turno",
    "sacar",
    "reservar",
    "para",
    "con",
    "del",
  ]);
  const qTokens = msgNorm
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !stop.has(t));
  const sTokens = nameNorm
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !stop.has(t));
  if (qTokens.length === 0 || sTokens.length === 0) return 0;

  let hits = 0;
  for (const qt of qTokens) {
    if (
      sTokens.some(
        (st) =>
          st === qt ||
          (st.length >= 5 &&
            qt.length >= 5 &&
            (st.startsWith(qt) || qt.startsWith(st))),
      )
    ) {
      hits += 1;
    }
  }
  return hits * 2;
}

function findByNormalizedName(
  catalog: ClinicServiceCatalogItem[],
  targetNormalized: string,
): ClinicServiceCatalogItem | null {
  return (
    catalog.find((c) => normalizeText(c.name) === targetNormalized) ?? null
  );
}

/**
 * Resuelve el tratamiento solicitado contra clinic_services activos.
 * Knowledge NO es fuente de verdad para reservar.
 */
export function resolveClinicService(input: {
  userMessage: string;
  services: ClinicService[];
  /** If false, skip booking-intent gate (already known booking context). */
  requireBookingIntent?: boolean;
}): ClinicServiceResolveResult {
  const catalog = toClinicServiceCatalog(input.services);
  const activeCatalog = catalog.filter((c) => c.active);
  const requireIntent = input.requireBookingIntent !== false;
  const booking = detectBookingIntent(input.userMessage);

  if (requireIntent && !booking) {
    return { status: "no_booking_intent", catalog: activeCatalog, booking_intent: false };
  }

  const msg = input.userMessage.trim();
  const msgNorm = normalizeText(msg);

  // Soft aliases only if target exists in catalog (active preferred).
  for (const alias of SOFT_ALIASES) {
    if (!alias.pattern.test(msg)) continue;
    const activeMatch = findByNormalizedName(activeCatalog, alias.targetNormalized);
    if (activeMatch) {
      return finalizeResolved(activeMatch, catalog);
    }
    const inactiveMatch = findByNormalizedName(catalog, alias.targetNormalized);
    if (inactiveMatch && !inactiveMatch.active) {
      return {
        status: "inactive",
        service_id: inactiveMatch.id,
        service_name: inactiveMatch.name,
        catalog: activeCatalog,
        booking_intent: true,
      };
    }
  }

  const scored = activeCatalog
    .map((item) => ({ item, score: scoreAgainstName(msgNorm, item.name) }))
    .filter((x) => x.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.item.name.localeCompare(b.item.name, "es"),
    );

  if (scored.length === 0) {
    // Check inactive catalog for explicit mention
    const inactiveScored = catalog
      .filter((c) => !c.active)
      .map((item) => ({ item, score: scoreAgainstName(msgNorm, item.name) }))
      .filter((x) => x.score >= 2)
      .sort((a, b) => b.score - a.score);
    if (inactiveScored[0]) {
      return {
        status: "inactive",
        service_id: inactiveScored[0].item.id,
        service_name: inactiveScored[0].item.name,
        catalog: activeCatalog,
        booking_intent: true,
      };
    }
    return {
      status: "not_found",
      catalog: activeCatalog,
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
      candidates: scored.slice(0, 4).map((s) => s.item),
      catalog: activeCatalog,
      booking_intent: true,
    };
  }

  if (scored[0]!.score >= 2) {
    return finalizeResolved(scored[0]!.item, catalog);
  }

  return {
    status: "not_found",
    catalog: activeCatalog,
    booking_intent: true,
    requested_raw: msg,
  };
}

function finalizeResolved(
  item: ClinicServiceCatalogItem,
  fullCatalog: ClinicServiceCatalogItem[],
): ClinicServiceResolveResult {
  const activeCatalog = fullCatalog.filter((c) => c.active);
  if (item.requires_initial_consultation) {
    const consultation = item.initial_consultation_service_id
      ? fullCatalog.find((c) => c.id === item.initial_consultation_service_id)
      : null;
    return {
      status: "requires_consultation",
      service_id: item.id,
      service_name: item.name,
      consultation_service_id: consultation?.id ?? null,
      consultation_service_name: consultation?.name ?? null,
      catalog: activeCatalog,
      booking_intent: true,
    };
  }
  return {
    status: "resolved",
    service_id: item.id,
    service_name: item.name,
    duration_minutes: item.duration_minutes,
    requires_initial_consultation: false,
    initial_consultation_service_id: item.initial_consultation_service_id,
    catalog: activeCatalog,
    booking_intent: true,
  };
}

export function formatClinicServiceCatalogForPrompt(
  catalog: ClinicServiceCatalogItem[],
): string {
  if (catalog.length === 0) {
    return "(Sin servicios estructurados configurados en clinic_services.)";
  }
  return catalog
    .map(
      (c) =>
        `- ${c.name} (id=${c.id}, ${c.duration_minutes} min${
          c.requires_initial_consultation ? ", requiere valoración" : ""
        })`,
    )
    .join("\n");
}

export function isKnownClinicServiceId(
  serviceId: string | undefined | null,
  catalog: ClinicServiceCatalogItem[],
): boolean {
  if (!serviceId) return false;
  return catalog.some((c) => c.id === serviceId && c.active);
}
