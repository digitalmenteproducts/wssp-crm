import type { SegmentRuleCondition, SegmentRules } from "@/types/ai";

export function fingerprintRules(rules: SegmentRules): string {
  const normalized = {
    operator: rules.operator,
    conditions: [...rules.conditions]
      .map((condition) => ({
        field: condition.field,
        op: condition.op,
        value:
          typeof condition.value === "string"
            ? condition.value.trim().toLowerCase()
            : condition.value,
      }))
      .sort((a, b) =>
        `${a.field}:${a.op}:${String(a.value)}`.localeCompare(
          `${b.field}:${b.op}:${String(b.value)}`,
        ),
      ),
  };

  return JSON.stringify(normalized);
}

export function rulesAreEquivalent(a: SegmentRules, b: SegmentRules): boolean {
  return fingerprintRules(a) === fingerprintRules(b);
}

const FIELD_LABELS: Record<SegmentRuleCondition["field"], string> = {
  product: "Producto",
  subcategory: "Subcategoría",
  intent: "Intención",
  contact_status: "Estado",
  reason: "Motivo",
  segment: "Etiqueta IA",
  tag: "Etiqueta",
  last_message_within_days: "Última actividad",
};

const STATUS_LABELS: Record<string, string> = {
  nuevo: "Nuevo",
  interesado: "Interesado",
  no_compro: "No compró",
  cliente: "Cliente",
  no_contactar: "No contactar",
};

const OP_LABELS: Record<SegmentRuleCondition["op"], string> = {
  eq: "=",
  contains: "contiene",
  lte: "≤",
  gte: "≥",
};

export function summarizeCondition(condition: SegmentRuleCondition): string {
  const field = FIELD_LABELS[condition.field] ?? condition.field;
  const op = OP_LABELS[condition.op] ?? condition.op;
  let value = String(condition.value);

  if (condition.field === "contact_status") {
    value = STATUS_LABELS[value] ?? value;
  }
  if (condition.field === "last_message_within_days") {
    if (condition.op === "gte") {
      return `Sin actividad ≥ ${value} días`;
    }
    return `${field} últimos ${value} días`;
  }

  return `${field} ${op} ${value}`;
}

export function summarizeRules(rules: SegmentRules): string {
  if (!rules.conditions.length) return "Sin reglas";
  const joiner = rules.operator === "or" ? " o " : " y ";
  return rules.conditions.map(summarizeCondition).join(joiner);
}

export function humanizeSegmentName(input: {
  status?: string | null;
  product?: string | null;
  tag?: string | null;
  intent?: string | null;
  reason?: string | null;
  days?: number | null;
}): string {
  const parts: string[] = [];

  if (input.product) {
    parts.push(`Interesados en ${input.product}`);
  } else if (input.tag) {
    parts.push(`Etiquetados como ${input.tag}`);
  } else if (input.intent) {
    parts.push(`Con intención ${input.intent}`);
  } else if (input.reason) {
    parts.push(`Con objeción ${input.reason}`);
  } else {
    parts.push("Contactos");
  }

  if (input.status) {
    const status = STATUS_LABELS[input.status] ?? input.status;
    if (input.status === "no_compro") {
      parts.push("que no compraron");
    } else if (input.status === "interesado") {
      parts.push("interesados");
    } else {
      parts.push(`en estado ${status}`);
    }
  }

  if (input.days) {
    parts.push(`recientemente (${input.days}d)`);
  }

  const name = parts.join(" ");
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function humanizeSegmentDescription(input: {
  status?: string | null;
  product?: string | null;
  tag?: string | null;
  intent?: string | null;
  reason?: string | null;
  days?: number | null;
}): string {
  const bits: string[] = [];
  if (input.status) {
    bits.push(`estado ${STATUS_LABELS[input.status] ?? input.status}`);
  }
  if (input.product) bits.push(`producto “${input.product}”`);
  if (input.tag) bits.push(`etiqueta “${input.tag}”`);
  if (input.intent) bits.push(`intención “${input.intent}”`);
  if (input.reason) bits.push(`motivo “${input.reason}”`);
  if (input.days) bits.push(`actividad en los últimos ${input.days} días`);

  if (!bits.length) return "Segmento dinámico basado en atributos de IA.";
  return `Contactos que cumplen: ${bits.join(", ")}. Se actualiza automáticamente.`;
}

export function buildSourceKey(parts: string[]): string {
  return parts
    .map((part) =>
      part
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9:_-]/g, ""),
    )
    .filter(Boolean)
    .join(":");
}
