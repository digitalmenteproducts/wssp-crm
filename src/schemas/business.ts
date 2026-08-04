import { z } from "zod";

export const updateBusinessGeneralSchema = z.object({
  name: z
    .string()
    .min(1, "El nombre de la empresa es obligatorio.")
    .min(2, "El nombre debe tener al menos 2 caracteres.")
    .max(120, "El nombre es demasiado largo."),
  support_email: z
    .union([z.literal(""), z.email("Introduce un correo de soporte válido.")])
    .optional(),
  timezone: z.string().min(1, "Selecciona una zona horaria."),
});

export const updateBusinessIntegrationsSchema = z.object({
  openai_api_key: z.string().optional(),
  whatsapp_access_token: z.string().optional(),
  whatsapp_phone_number_id: z.string().optional(),
  whatsapp_business_account_id: z.string().optional(),
  whatsapp_verify_token: z.string().optional(),
});

export const updateBusinessAiSchema = z.object({
  ai_engine_enabled: z.boolean(),
  classification_prompt: z
    .string()
    .min(1, "El prompt de clasificación es obligatorio.")
    .max(8000, "El prompt es demasiado largo."),
});

export type UpdateBusinessGeneralInput = z.infer<
  typeof updateBusinessGeneralSchema
>;
export type UpdateBusinessIntegrationsInput = z.infer<
  typeof updateBusinessIntegrationsSchema
>;
export type UpdateBusinessAiInput = z.infer<typeof updateBusinessAiSchema>;
