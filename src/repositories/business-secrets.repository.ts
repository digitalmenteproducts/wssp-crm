import { maskSecret } from "@/lib/business";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Único punto de acceso a public.business_secrets (service role).
 * Solo servidor. Nunca devolver estos valores a Client Components ni a
 * respuestas HTTP; para la UI usar getSecretsStatus.
 */

export type BusinessSecretsPatch = Partial<{
  openai_api_key: string | null;
  whatsapp_access_token: string | null;
  whatsapp_verify_token: string | null;
}>;

export type BusinessSecretsStatus = {
  openai_api_key_set: boolean;
  openai_api_key_hint: string | null;
  whatsapp_access_token_set: boolean;
  whatsapp_access_token_hint: string | null;
  whatsapp_verify_token_set: boolean;
  whatsapp_verify_token_hint: string | null;
};

export type WhatsAppCredentials = {
  accessToken: string | null;
  phoneNumberId: string | null;
  businessAccountId: string | null;
};

type RepoResult<T> = { data: T; error: null } | { data: null; error: string };

export async function getWhatsAppCredentials(
  businessId: string,
): Promise<RepoResult<WhatsAppCredentials>> {
  const supabase = createAdminClient();

  const [secrets, settings] = await Promise.all([
    supabase
      .from("business_secrets")
      .select("whatsapp_access_token")
      .eq("business_id", businessId)
      .maybeSingle<{ whatsapp_access_token: string | null }>(),
    supabase
      .from("business_settings")
      .select("whatsapp_phone_number_id, whatsapp_business_account_id")
      .eq("business_id", businessId)
      .maybeSingle<{
        whatsapp_phone_number_id: string | null;
        whatsapp_business_account_id: string | null;
      }>(),
  ]);

  if (secrets.error) {
    return { data: null, error: secrets.error.message };
  }
  if (settings.error) {
    return { data: null, error: settings.error.message };
  }

  return {
    data: {
      accessToken: secrets.data?.whatsapp_access_token ?? null,
      phoneNumberId: settings.data?.whatsapp_phone_number_id ?? null,
      businessAccountId: settings.data?.whatsapp_business_account_id ?? null,
    },
    error: null,
  };
}

export async function getOpenAICredentials(
  businessId: string,
): Promise<RepoResult<{ apiKey: string | null }>> {
  const { data, error } = await createAdminClient()
    .from("business_secrets")
    .select("openai_api_key")
    .eq("business_id", businessId)
    .maybeSingle<{ openai_api_key: string | null }>();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: { apiKey: data?.openai_api_key ?? null }, error: null };
}

export async function getSecretsStatus(
  businessId: string,
): Promise<RepoResult<BusinessSecretsStatus>> {
  const { data, error } = await createAdminClient()
    .from("business_secrets")
    .select("openai_api_key, whatsapp_access_token, whatsapp_verify_token")
    .eq("business_id", businessId)
    .maybeSingle<{
      openai_api_key: string | null;
      whatsapp_access_token: string | null;
      whatsapp_verify_token: string | null;
    }>();

  if (error) {
    return { data: null, error: error.message };
  }

  return {
    data: {
      openai_api_key_set: Boolean(data?.openai_api_key),
      openai_api_key_hint: maskSecret(data?.openai_api_key),
      whatsapp_access_token_set: Boolean(data?.whatsapp_access_token),
      whatsapp_access_token_hint: maskSecret(data?.whatsapp_access_token),
      whatsapp_verify_token_set: Boolean(data?.whatsapp_verify_token),
      whatsapp_verify_token_hint: maskSecret(data?.whatsapp_verify_token),
    },
    error: null,
  };
}

export async function findBusinessIdByWhatsAppVerifyToken(verifyToken: string) {
  return createAdminClient()
    .from("business_secrets")
    .select("business_id")
    .eq("whatsapp_verify_token", verifyToken)
    .maybeSingle<{ business_id: string }>();
}

/** El llamador debe haber verificado rol owner/admin: service role salta RLS. */
export async function updateSecrets(
  businessId: string,
  patch: BusinessSecretsPatch,
): Promise<{ error: string | null }> {
  if (Object.keys(patch).length === 0) {
    return { error: null };
  }

  const { error } = await createAdminClient()
    .from("business_secrets")
    .upsert({ business_id: businessId, ...patch }, { onConflict: "business_id" });

  return { error: error?.message ?? null };
}
