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

/** Ajusta confidence/handoff inconsistentes sin forzar handoff por falta de FAQ. */
export function reconcileAgentConfidence(input: {
  result: {
    reply: string;
    should_handoff: boolean;
    handoff_reason: string | null;
    confidence: "high" | "medium" | "low";
  };
  userMessage?: string;
}): {
  reply: string;
  should_handoff: boolean;
  handoff_reason: string | null;
  confidence: "high" | "medium" | "low";
} {
  const result = { ...input.result };
  const combined = `${input.userMessage ?? ""}\n${result.reply}\n${result.handoff_reason ?? ""}`;

  const medicalSensitive =
    /medicamento|medicaci[oó]n|embaraz|lactancia|diagn[oó]stic|contraindica|s[ií]ntoma|estudio m[eé]dico|receta|qu[eé] me (puedo|debo) tomar|b[oó]tox.*(embaraz|lact)|puedo hacerme.*(embaraz|lact)/i.test(
      combined,
    );

  const inventingConfirmedFact =
    /no tengo (la )?informaci[oó]n|no est[aá] confirmad|no figura|no dispon(go|emos) de (un )?precio|no tengo un precio/i.test(
      `${result.reply}\n${result.handoff_reason ?? ""}`,
    );

  // Inferencia segura presentada como certeza absoluta + high → bajar a medium.
  if (
    result.confidence === "high" &&
    /normalmente|en principio|por lo general|suele|probablemente/i.test(
      result.reply,
    ) &&
    !medicalSensitive
  ) {
    result.confidence = "medium";
  }

  if (medicalSensitive) {
    result.should_handoff = true;
    if (!result.handoff_reason) {
      result.handoff_reason = "Consulta médica personalizada; requiere profesional.";
    }
    if (result.confidence === "high") {
      result.confidence = "low";
    }
    return result;
  }

  // Dato de negocio no confirmado: no permitir high.
  if (inventingConfirmedFact && result.confidence === "high") {
    result.confidence = "low";
  }

  return result;
}

/** ¿Debemos forzar handoff tras la respuesta del modelo? */
export function shouldForceHandoff(input: {
  result: {
    reply: string;
    should_handoff: boolean;
    handoff_reason: string | null;
    confidence: "high" | "medium" | "low";
  };
  userMessage: string;
  handoffEnabled: boolean;
}): boolean {
  if (!input.handoffEnabled) return false;
  if (input.result.should_handoff) return false; // ya marcado

  const combined = `${input.userMessage}\n${input.result.reply}\n${input.result.handoff_reason ?? ""}`;

  // Médico / personalizado: sí.
  if (
    /medicamento|embaraz|diagn[oó]stic|contraindica|s[ií]ntoma|estudio m[eé]dico|receta|qu[eé] me (puedo|debo) tomar/i.test(
      combined,
    )
  ) {
    return true;
  }

  // Pedido explícito de humano.
  if (
    /hablar con (una )?persona|hablar con (un )?(humano|asesor|alguien)|pasar con|atenci[oó]n humana|operador/i.test(
      input.userMessage,
    )
  ) {
    return true;
  }

  // No forzar handoff solo por confidence low en preguntas casuales.
  return false;
}

/** Preguntas de bajo riesgo: no deben quedar con handoff automático del modelo. */
export function isLowRiskConversationalQuery(userMessage: string): boolean {
  return /lluvia|mal tiempo|acompa[nñ]ad|llegar caminando|a pie|estacionamiento|parking|aire acondicionado|wifi|ba[nñ]o|sala de espera/i.test(
    userMessage,
  );
}

export function softenLowRiskHandoff(input: {
  result: {
    reply: string;
    should_handoff: boolean;
    handoff_reason: string | null;
    confidence: "high" | "medium" | "low";
  };
  userMessage: string;
}): {
  reply: string;
  should_handoff: boolean;
  handoff_reason: string | null;
  confidence: "high" | "medium" | "low";
} {
  const result = { ...input.result };
  if (!isLowRiskConversationalQuery(input.userMessage)) {
    return result;
  }

  if (
    /aire acondicionado|estacionamiento|parking|wifi/i.test(input.userMessage) &&
    /cuentan con|suelen contar|normalmente.*aire|s[ií], (tenemos|hay)/i.test(
      result.reply,
    ) &&
    !/no (tengo|est[aá]) confirmad|no figura|no dispon/i.test(result.reply)
  ) {
    result.confidence = "low";
  }

  if (result.should_handoff) {
    result.should_handoff = false;
    result.handoff_reason = null;
    if (
      result.confidence === "low" &&
      /lluvia|acompa[nñ]ad|caminando|a pie/i.test(input.userMessage)
    ) {
      result.confidence = "medium";
    }
  }

  return result;
}
