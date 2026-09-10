import type { AiKnowledgeEntry } from "@/types/ai-agent";

export type RankedKnowledgeEntry = {
  entry: AiKnowledgeEntry;
  score: number;
};

const STOPWORDS = new Set([
  "que",
  "cual",
  "cuales",
  "como",
  "donde",
  "cuando",
  "quien",
  "quienes",
  "por",
  "para",
  "con",
  "sin",
  "una",
  "uno",
  "unos",
  "unas",
  "los",
  "las",
  "del",
  "de",
  "la",
  "el",
  "al",
  "en",
  "es",
  "son",
  "esta",
  "estan",
  "este",
  "estos",
  "estas",
  "hay",
  "tiene",
  "tienen",
  "tengo",
  "hola",
  "buenas",
  "buen",
  "dia",
  "tardes",
  "noches",
  "porfa",
  "porfavor",
  "favor",
  "me",
  "mi",
  "tu",
  "su",
  "les",
  "nos",
  "se",
  "lo",
  "le",
  "y",
  "o",
  "u",
  "a",
]);

/** Expansión semántica ligera (ES) para MVP sin embeddings. */
const SYNONYM_GROUPS: string[][] = [
  [
    "ubicacion",
    "ubicado",
    "ubicados",
    "ubicada",
    "ubicadas",
    "direccion",
    "direcciones",
    "domicilio",
    "localizacion",
    "queda",
    "quedan",
    "sede",
    "lugar",
    "sitio",
    "mapa",
    "donde",
  ],
  [
    "horario",
    "horarios",
    "hora",
    "horas",
    "atencion",
    "abre",
    "abren",
    "cierra",
    "cierran",
    "apertura",
  ],
  [
    "precio",
    "precios",
    "costo",
    "costos",
    "cuesta",
    "cuestan",
    "valor",
    "tarifa",
    "tarifas",
    "pago",
    "pagos",
    "cuanto",
  ],
  [
    "tratamiento",
    "tratamientos",
    "servicio",
    "servicios",
    "procedimiento",
    "procedimientos",
    "ofrecen",
    "ofrecer",
    "disponible",
    "disponibles",
  ],
  [
    "turno",
    "turnos",
    "cita",
    "citas",
    "consulta",
    "agendar",
    "reservar",
    "sacar",
  ],
  [
    "contacto",
    "contactar",
    "telefono",
    "whatsapp",
    "email",
    "correo",
    "mail",
  ],
  [
    "medicamento",
    "medicamentos",
    "medicina",
    "farmaco",
    "farmacos",
    "receta",
    "diagnostico",
    "sintoma",
    "sintomas",
  ],
];

const SYNONYM_LOOKUP = buildSynonymLookup(SYNONYM_GROUPS);

function buildSynonymLookup(groups: string[][]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const group of groups) {
    const set = new Set(group);
    for (const word of group) {
      map.set(word, set);
    }
  }
  return map;
}

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/g, "n");
}

function tokenize(value: string, options?: { keepStopwords?: boolean }): string[] {
  const normalized = normalizeText(value);
  const parts = normalized
    .split(/[^a-z0-9]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);

  if (options?.keepStopwords) {
    return parts;
  }

  return parts.filter((part) => !STOPWORDS.has(part));
}

function expandToken(token: string): Set<string> {
  const out = new Set<string>([token]);
  const group = SYNONYM_LOOKUP.get(token);
  if (group) {
    for (const syn of group) out.add(syn);
  }
  // Variantes simples de plural / género
  if (token.endsWith("es") && token.length > 4) out.add(token.slice(0, -2));
  if (token.endsWith("s") && token.length > 3) out.add(token.slice(0, -1));
  if (token.endsWith("cion") || token.endsWith("sion")) {
    out.add(`${token}es`);
  }
  return out;
}

function sharesStem(a: string, b: string): boolean {
  if (a === b) return true;
  // Evita falsos positivos cortos (p.ej. "local" vs "localizacion").
  if (a.length < 6 || b.length < 6) return false;
  const prefixLen = Math.min(6, Math.min(a.length, b.length));
  return a.slice(0, prefixLen) === b.slice(0, prefixLen);
}

function scoreTokenAgainstHaystack(
  token: string,
  haystack: string,
  haystackTokens: string[],
): number {
  let best = 0;
  const variants = expandToken(token);

  for (const variant of variants) {
    if (haystack.includes(variant)) {
      best = Math.max(best, variant === token ? 2 : 1.5);
    }
    for (const ht of haystackTokens) {
      if (sharesStem(variant, ht)) {
        best = Math.max(best, 1.25);
      }
    }
  }

  return best;
}

/**
 * Recuperación simple de conocimiento (sin embeddings).
 * Normaliza acentos, expande sinónimos y rankea título/contenido/categoría.
 */
export function rankKnowledgeEntriesDetailed(
  entries: AiKnowledgeEntry[],
  query: string,
  limit = 5,
): RankedKnowledgeEntry[] {
  const queryTokens = tokenize(query);
  // Si solo quedaron stopwords, usar también tokens crudos (p.ej. "dónde").
  const effectiveTokens =
    queryTokens.length > 0 ? queryTokens : tokenize(query, { keepStopwords: true });

  if (effectiveTokens.length === 0) {
    return entries.slice(0, limit).map((entry) => ({ entry, score: 0 }));
  }

  const locationIntent = effectiveTokens.some((token) =>
    [...expandToken(token)].some((variant) =>
      [
        "ubicacion",
        "direccion",
        "queda",
        "quedan",
        "ubicado",
        "ubicados",
        "horario",
        "horarios",
        "contacto",
        "telefono",
        "whatsapp",
      ].includes(variant),
    ),
  );

  const scored = entries.map((entry) => {
    const titleNorm = normalizeText(entry.title);
    const contentNorm = normalizeText(entry.content);
    const categoryNorm = normalizeText(entry.category);
    const haystack = `${titleNorm}\n${contentNorm}\n${categoryNorm}`;
    const titleTokens = tokenize(entry.title, { keepStopwords: true });
    const contentTokens = tokenize(entry.content, { keepStopwords: true });

    let score = 0;
    let originalHits = 0;

    for (const token of effectiveTokens) {
      const titleHit = scoreTokenAgainstHaystack(token, titleNorm, titleTokens);
      const contentHit = scoreTokenAgainstHaystack(
        token,
        contentNorm,
        contentTokens,
      );
      const categoryHit = scoreTokenAgainstHaystack(
        token,
        categoryNorm,
        [categoryNorm],
      );

      if (titleHit > 0) {
        score += titleHit * 3;
        originalHits += 1;
      } else if (contentHit > 0) {
        score += contentHit;
        originalHits += 1;
      } else if (categoryHit > 0) {
        score += categoryHit * 1.5;
        originalHits += 1;
      } else if (
        [...expandToken(token)].some((variant) => haystack.includes(variant))
      ) {
        score += 1;
        originalHits += 1;
      }
    }

    if (originalHits >= 2) {
      score += 2;
    }

    if (
      locationIntent &&
      /ubicacion|horario|contacto|direccion/.test(titleNorm)
    ) {
      score += 5;
    }

    return { entry, score: Number(score.toFixed(2)) };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .slice(0, limit);
}

export function rankKnowledgeEntries(
  entries: AiKnowledgeEntry[],
  query: string,
  limit = 5,
): AiKnowledgeEntry[] {
  return rankKnowledgeEntriesDetailed(entries, query, limit).map(
    (item) => item.entry,
  );
}

export function formatKnowledgeForPrompt(entries: AiKnowledgeEntry[]): string {
  if (entries.length === 0) {
    return "(Sin entradas de conocimiento relevantes.)";
  }

  return entries
    .map(
      (entry, index) =>
        `[${index + 1}] ${entry.title} (${entry.category})\n${entry.content}`,
    )
    .join("\n\n");
}

/** Ajusta confidence cuando el modelo dice que falta info pero marca high. */
export function reconcileAgentConfidence(input: {
  result: {
    reply: string;
    should_handoff: boolean;
    handoff_reason: string | null;
    confidence: "high" | "medium" | "low";
  };
  knowledgeCount: number;
}): {
  reply: string;
  should_handoff: boolean;
  handoff_reason: string | null;
  confidence: "high" | "medium" | "low";
} {
  const result = { ...input.result };
  const combined = `${result.reply}\n${result.handoff_reason ?? ""}`;
  const lacksKnowledge =
    /no tengo (la )?informaci[oó]n|falta (de )?informaci[oó]n|sin informaci[oó]n|no cuento con|no dispon(go|emos)|no est[aá] (en|disponible)|informaci[oó]n cr[ií]tica/i.test(
      combined,
    );

  if (input.knowledgeCount === 0 && result.should_handoff) {
    if (result.confidence === "high") {
      result.confidence = "low";
    }
    return result;
  }

  if (lacksKnowledge) {
    if (result.confidence === "high") {
      result.confidence = "low";
    } else if (result.confidence === "medium" && result.should_handoff) {
      result.confidence = "low";
    }
  }

  return result;
}
