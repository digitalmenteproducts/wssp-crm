import { z } from "zod";

export const contactBoardStatusSchema = z.enum([
  "nuevo",
  "interesado",
  "no_compro",
  "cliente",
  "no_contactar",
]);

export const updateContactStatusSchema = z.object({
  contactId: z.string().uuid("Contacto inválido."),
  status: contactBoardStatusSchema,
});

export type UpdateContactStatusInput = z.infer<typeof updateContactStatusSchema>;

export const reanalyzeContactSchema = z.object({
  contactId: z.string().uuid("Contacto inválido."),
});

export type ReanalyzeContactInput = z.infer<typeof reanalyzeContactSchema>;

export const contactTagSchema = z.object({
  label: z.string().trim().min(1).max(60),
  source: z.enum(["ai", "manual"]),
});

export const updateContactTagsSchema = z.object({
  contactId: z.string().uuid("Contacto inválido."),
  tags: z.array(contactTagSchema).max(40),
});

export type UpdateContactTagsInput = z.infer<typeof updateContactTagsSchema>;

export const getContactDetailSchema = z.object({
  contactId: z.string().uuid("Contacto inválido."),
});

export const createManualContactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre es obligatorio.")
    .max(120, "El nombre es demasiado largo."),
  phone: z
    .string()
    .trim()
    .min(1, "El teléfono es obligatorio.")
    .max(40, "El teléfono es demasiado largo."),
  email: z
    .union([
      z.literal(""),
      z.email("Introduce un correo electrónico válido.").max(320),
    ])
    .optional(),
});

export type CreateManualContactInput = z.infer<typeof createManualContactSchema>;
