import { z } from "zod";

export const aiAgentToneSchema = z.enum([
  "profesional",
  "amigable",
  "comercial",
  "directo",
  "personalizado",
]);

export const aiAgentLanguageSchema = z.enum(["auto", "es", "en"]);

export const aiAgentResponseLengthSchema = z.enum([
  "breve",
  "normal",
  "detallada",
]);

export const aiKnowledgeCategorySchema = z.enum([
  "faq",
  "negocio",
  "productos",
  "politicas",
  "envios",
  "pagos",
  "otro",
]);

export const updateAiAgentSettingsSchema = z.object({
  enabled: z.boolean(),
  agent_name: z
    .string()
    .min(1, "El nombre del agente es obligatorio.")
    .max(80),
  business_name: z.string().max(120).default(""),
  business_description: z.string().max(2000).default(""),
  system_instructions: z.string().max(8000).default(""),
  tone: aiAgentToneSchema,
  custom_tone_instructions: z.string().max(2000).default(""),
  language: aiAgentLanguageSchema,
  response_length: aiAgentResponseLengthSchema,
  human_handoff_enabled: z.boolean(),
  human_handoff_instructions: z.string().max(4000).default(""),
  max_failed_attempts: z.coerce.number().int().min(1).max(10),
});

export const upsertKnowledgeEntrySchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1, "El título es obligatorio.").max(200),
  content: z.string().min(1, "El contenido es obligatorio.").max(10000),
  category: aiKnowledgeCategorySchema,
  enabled: z.boolean().default(true),
});

export const deleteKnowledgeEntrySchema = z.object({
  id: z.string().uuid(),
});

export const testAiAgentSchema = z.object({
  message: z
    .string()
    .min(1, "Escribe un mensaje de prueba.")
    .max(2000),
});

export const aiAgentReplyResultSchema = z.object({
  reply: z.string(),
  should_handoff: z.boolean(),
  handoff_reason: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
});

export type UpdateAiAgentSettingsInput = z.infer<
  typeof updateAiAgentSettingsSchema
>;
export type UpsertKnowledgeEntryInput = z.infer<
  typeof upsertKnowledgeEntrySchema
>;
export type TestAiAgentInput = z.infer<typeof testAiAgentSchema>;
