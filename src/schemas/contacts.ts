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
