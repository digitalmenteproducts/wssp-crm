import { z } from "zod";

import { CREATABLE_ROLES } from "@/lib/team";

export const createBusinessUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres.")
    .max(120, "El nombre es demasiado largo."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "El email es obligatorio.")
    .pipe(z.email("Introduce un correo electrónico válido.")),
  role: z.enum(CREATABLE_ROLES, "Selecciona un rol válido (Administrador o Profesional)."),
});

export type CreateBusinessUserInput = z.infer<typeof createBusinessUserSchema>;
