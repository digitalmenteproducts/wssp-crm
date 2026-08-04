import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("Introduce un correo electrónico válido."),
  password: z
    .string()
    .min(1, "La contraseña es obligatoria.")
    .min(6, "La contraseña debe tener al menos 6 caracteres."),
});

export const registerSchema = z.object({
  name: z
    .string()
    .min(1, "El nombre es obligatorio.")
    .min(2, "El nombre debe tener al menos 2 caracteres."),
  email: z.email("Introduce un correo electrónico válido."),
  password: z
    .string()
    .min(1, "La contraseña es obligatoria.")
    .min(6, "La contraseña debe tener al menos 6 caracteres."),
});

export const recoverSchema = z.object({
  email: z.email("Introduce un correo electrónico válido."),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type RecoverInput = z.infer<typeof recoverSchema>;
