import { z } from "zod";

export const classificationResultSchema = z.object({
  summary: z.string().min(1),
  product: z.string().nullable(),
  subcategory: z.string().nullable(),
  intent: z.string().nullable(),
  status: z.enum([
    "nuevo",
    "interesado",
    "no_compro",
    "cliente",
    "no_contactar",
  ]),
  reason: z.string().nullable(),
  segment: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  attributes: z
    .object({
      delivery: z.boolean().optional(),
      price_sensitive: z.boolean().optional(),
      tags: z.array(z.string()).optional(),
    })
    .passthrough()
    .default({}),
});

export type ClassificationResult = z.infer<typeof classificationResultSchema>;

export const segmentRuleConditionSchema = z.object({
  field: z.enum([
    "product",
    "subcategory",
    "intent",
    "contact_status",
    "reason",
    "segment",
    "tag",
    "last_message_within_days",
  ]),
  op: z.enum(["eq", "contains", "lte", "gte"]),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

export const segmentRulesSchema = z.object({
  operator: z.enum(["and", "or"]).default("and"),
  conditions: z
    .array(segmentRuleConditionSchema)
    .min(1, "Añade al menos una regla."),
});

export const createSegmentSchema = z.object({
  name: z.string().min(2, "El nombre del segmento es obligatorio."),
  description: z.string().optional(),
  rules_json: segmentRulesSchema,
});

export type CreateSegmentInput = z.infer<typeof createSegmentSchema>;
