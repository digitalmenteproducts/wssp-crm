import { z } from "zod";

export const templateStatusSchema = z.enum([
  "draft",
  "pending",
  "approved",
  "rejected",
  "paused",
  "disabled",
]);

export const createTemplateSchema = z.object({
  name: z
    .string()
    .min(2, "El nombre es obligatorio.")
    .max(120)
    .regex(
      /^[a-z0-9_]+$/,
      "Usa solo minúsculas, números y guion bajo (formato Meta).",
    ),
  category: z.string().min(1, "La categoría es obligatoria.").max(60),
  language: z.string().min(2).max(12).default("es"),
  content: z.string().min(1, "El contenido es obligatorio.").max(2000),
  segment_id: z.string().uuid().nullable().optional(),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9_]+$/, "Usa solo minúsculas, números y guion bajo.")
    .optional(),
  category: z.string().min(1).max(60).optional(),
  language: z.string().min(2).max(12).optional(),
  content: z.string().min(1).max(2000).optional(),
  segment_id: z.string().uuid().nullable().optional(),
  status: templateStatusSchema.optional(),
});

export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export const deleteTemplateSchema = z.object({
  id: z.string().uuid(),
});

export const assignTemplateSegmentSchema = z.object({
  id: z.string().uuid(),
  segment_id: z.string().uuid().nullable(),
});
