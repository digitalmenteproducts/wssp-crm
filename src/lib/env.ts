import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string({
      error: "NEXT_PUBLIC_SUPABASE_URL es obligatoria. Cópiala desde .env.example a .env.local.",
    })
    .url("NEXT_PUBLIC_SUPABASE_URL debe ser una URL válida de Supabase."),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string({
      error:
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY es obligatoria. Cópiala desde .env.example a .env.local.",
    })
    .min(
      1,
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no puede estar vacía. Revisa tu proyecto de Supabase.",
    ),
});

const optionalServerEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1).optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().min(1).optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1).optional(),
  META_APP_SECRET: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(1).optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type OptionalServerEnv = z.infer<typeof optionalServerEnvSchema>;

function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join(" ");
}

/**
 * Variables públicas de Supabase. Lanza un error claro si faltan.
 * Usar al crear clientes de browser/server.
 */
export function getPublicEnv(): PublicEnv {
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      `[WhatsCRM AI] Variables de entorno de Supabase incompletas. ${formatZodError(parsed.error)}`,
    );
  }

  return parsed.data;
}

/**
 * Lectura segura para middleware / bootstrap: no lanza si aún no hay .env.local.
 */
export function getPublicEnvSafe(): PublicEnv | null {
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  return parsed.success ? parsed.data : null;
}

/**
 * Secretos de servidor. OpenAI, WhatsApp y cron son opcionales en la fase inicial.
 */
export function getOptionalServerEnv(): OptionalServerEnv {
  const parsed = optionalServerEnvSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_BUSINESS_ACCOUNT_ID: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN,
    META_APP_SECRET: process.env.META_APP_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
  });

  if (!parsed.success) {
    throw new Error(
      `[WhatsCRM AI] Variables de entorno de servidor inválidas. ${formatZodError(parsed.error)}`,
    );
  }

  return parsed.data;
}

/**
 * Service role: solo servidor. Error claro si se solicita y no existe.
 */
export function getServiceRoleKey(): string {
  const key = getOptionalServerEnv().SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new Error(
      "[WhatsCRM AI] SUPABASE_SERVICE_ROLE_KEY es obligatoria para operaciones administrativas. Añádela en .env.local (nunca en el cliente).",
    );
  }

  return key;
}
