import type { CreatableRole } from "@/lib/team";

export type BusinessUserCredentials = {
  name: string;
  email: string;
  role: CreatableRole;
  businessName: string;
  loginUrl: string;
  temporaryPassword: string;
};

export type CredentialsSendResult =
  | { sent: true }
  | { sent: false; reason: "not_configured" | "failed" };

/**
 * Proveedor de correo intercambiable. Supabase Auth no permite enviar correos con contenido propio
 * (sus plantillas solo cubren confirmación, invitación, magic link, recuperación y cambio de email),
 * así que las credenciales necesitan un proveedor transaccional que todavía no está configurado.
 */
export type CredentialsSender = (credentials: BusinessUserCredentials) => Promise<CredentialsSendResult>;

/** Sin proveedor configurado: no envía nada ni hace llamadas de red. */
export const notConfiguredCredentialsSender: CredentialsSender = async () => ({
  sent: false,
  reason: "not_configured",
});

export async function sendBusinessUserCredentials(
  credentials: BusinessUserCredentials,
  sender: CredentialsSender = notConfiguredCredentialsSender,
): Promise<CredentialsSendResult> {
  try {
    return await sender(credentials);
  } catch {
    // Nunca registrar el error: podría contener las credenciales.
    return { sent: false, reason: "failed" };
  }
}
