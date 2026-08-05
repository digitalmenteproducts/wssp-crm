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
