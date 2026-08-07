import { z } from "zod";

export const templateStatusSchema = z.enum([
  "draft",
  "submitting",
  "pending",
  "approved",
  "rejected",
  "paused",
  "disabled",
  "error",
]);

export const templateButtonSchema = z.object({
  type: z.enum(["QUICK_REPLY", "URL", "PHONE_NUMBER"]),
  text: z.string().min(1).max(25),
  url: z.string().url().optional(),
  phone_number: z.string().min(6).max(20).optional(),
});

export const createTemplateSchema = z
  .object({
    display_name: z
      .string()
      .min(2, "El nombre amigable es obligatorio.")
      .max(120),
    name: z
      .string()
      .min(2, "El nombre técnico es obligatorio.")
      .max(512)
      .regex(
        /^[a-z0-9_]+$/,
        "El nombre técnico solo admite minúsculas, números y guion bajo.",
      ),
    category: z.enum(["MARKETING", "UTILITY"], {
      error: "Categoría inválida.",
    }),
    language: z.enum(["es", "en_US"], {
      error: "Idioma inválido.",
    }),
    header_text: z.string().max(60).optional().nullable(),
    content: z.string().min(1, "El cuerpo es obligatorio.").max(1024),
    footer_text: z.string().max(60).optional().nullable(),
    buttons: z.array(templateButtonSchema).max(3).default([]),
    variable_examples: z.record(z.string(), z.string()).default({}),
    segment_id: z.string().uuid().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const vars = Array.from(data.content.matchAll(/\{\{\s*(\d+)\s*\}\}/g)).map(
      (match) => match[1],
    );
    const unique = Array.from(new Set(vars)).sort(
      (a, b) => Number(a) - Number(b),
    );

    for (let i = 0; i < unique.length; i += 1) {
      if (unique[i] !== String(i + 1)) {
        ctx.addIssue({
          code: "custom",
          path: ["content"],
          message: "Las variables deben ser consecutivas: {{1}}, {{2}}, {{3}}…",
        });
        break;
      }
    }

    for (const key of unique) {
      if (!data.variable_examples[key]?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["variable_examples", key],
          message: `Falta el ejemplo para {{${key}}}.`,
        });
      }
    }

    for (const [index, button] of data.buttons.entries()) {
      if (button.type === "URL" && !button.url) {
        ctx.addIssue({
          code: "custom",
          path: ["buttons", index, "url"],
          message: "La URL del botón es obligatoria.",
        });
      }
      if (button.type === "PHONE_NUMBER" && !button.phone_number) {
        ctx.addIssue({
          code: "custom",
          path: ["buttons", index, "phone_number"],
          message: "El teléfono del botón es obligatorio.",
        });
      }
    }
  });

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = createTemplateSchema
  .partial()
  .extend({
    id: z.string().uuid(),
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

export const submitTemplateSchema = z.object({
  id: z.string().uuid(),
});

export const duplicateTemplateSchema = z.object({
  id: z.string().uuid(),
});
