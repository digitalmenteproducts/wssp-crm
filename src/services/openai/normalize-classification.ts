import { z } from "zod";

import type { ClassificationResult } from "@/schemas/ai";
import { classificationResultSchema } from "@/schemas/ai";

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pick(
  source: Record<string, unknown>,
  keys: string[],
): unknown {
  for (const key of keys) {
    if (key in source && source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }
  return undefined;
}

function normalizeStatus(value: unknown): ClassificationResult["status"] {
  const raw = asString(value)?.toLowerCase() ?? "";

  const map: Record<string, ClassificationResult["status"]> = {
    nuevo: "nuevo",
    new: "nuevo",
    interesado: "interesado",
    interested: "interesado",
    interes: "interesado",
    "no_compro": "no_compro",
    "no compro": "no_compro",
    "no compró": "no_compro",
    "no_compra": "no_compro",
    "no compra": "no_compro",
    lost: "no_compro",
    cliente: "cliente",
    customer: "cliente",
    comprador: "cliente",
    "no_contactar": "no_contactar",
    "no contactar": "no_contactar",
    spam: "no_contactar",
  };

  return map[raw] ?? "interesado";
}

/**
 * Acepta respuestas de OpenAI con claves EN/ES u omisiones,
 * y las convierte al contrato interno del CRM.
 */
export function normalizeClassificationPayload(
  input: unknown,
): ClassificationResult {
  const source =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};

  const attributesRaw = pick(source, ["attributes", "atributos"]);
  const attributes =
    attributesRaw && typeof attributesRaw === "object"
      ? (attributesRaw as Record<string, unknown>)
      : {};

  const candidate = {
    summary:
      asString(pick(source, ["summary", "resumen", "resumen_conversacion"])) ??
      "Conversación sin resumen disponible.",
    product: asString(
      pick(source, [
        "product",
        "producto",
        "producto_principal",
        "main_product",
      ]),
    ),
    subcategory: asString(
      pick(source, [
        "subcategory",
        "subcategoria",
        "subcategoría",
        "producto_especifico",
        "producto_específico",
        "specific_product",
      ]),
    ),
    intent: asString(
      pick(source, ["intent", "intencion", "intención", "intention"]),
    ),
    status: normalizeStatus(
      pick(source, ["status", "estado", "estado_comercial", "commercial_status"]),
    ),
    reason: asString(
      pick(source, [
        "reason",
        "motivo",
        "motivo_no_compra",
        "objecion",
        "objeción",
      ]),
    ),
    segment: asString(
      pick(source, ["segment", "segmento", "etiqueta", "label"]),
    ),
    confidence: (() => {
      const value = asNumber(
        pick(source, ["confidence", "confianza", "score"]),
      );
      if (value == null) return 0.5;
      if (value > 1 && value <= 100) return value / 100;
      return Math.min(1, Math.max(0, value));
    })(),
    attributes: {
      delivery: Boolean(
        attributes.delivery ?? attributes.delivery_requested ?? false,
      ),
      price_sensitive: Boolean(
        attributes.price_sensitive ?? attributes.sensible_precio ?? false,
      ),
      tags: Array.isArray(attributes.tags)
        ? attributes.tags.filter((tag): tag is string => typeof tag === "string")
        : [],
      ...attributes,
    },
  };

  return classificationResultSchema.parse(candidate);
}

export const looseClassificationSchema = z.unknown().transform((value) =>
  normalizeClassificationPayload(value),
);
