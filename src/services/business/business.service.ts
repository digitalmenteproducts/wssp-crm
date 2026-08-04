import { isSecretProvided, maskSecret, slugify } from "@/lib/business";
import * as businessRepository from "@/repositories/business.repository";
import { getCurrentUser } from "@/repositories/auth.repository";
import {
  updateBusinessAiSchema,
  updateBusinessGeneralSchema,
  updateBusinessIntegrationsSchema,
  type UpdateBusinessAiInput,
  type UpdateBusinessGeneralInput,
  type UpdateBusinessIntegrationsInput,
} from "@/schemas/business";
import type {
  BusinessSettings,
  BusinessSettingsPublic,
  BusinessWorkspace,
} from "@/types/business";

export type BusinessActionResult =
  | { ok: true; message?: string; workspace?: BusinessWorkspace }
  | { ok: false; error: string };

function formatZodIssues(error: { issues: { message: string }[] }): string {
  return error.issues.map((issue) => issue.message).join(" ");
}

function toPublicSettings(settings: BusinessSettings): BusinessSettingsPublic {
  const token = settings.whatsapp_access_token;
  const phoneId = settings.whatsapp_phone_number_id;

  return {
    business_id: settings.business_id,
    openai_api_key_set: Boolean(settings.openai_api_key),
    openai_api_key_hint: maskSecret(settings.openai_api_key),
    whatsapp_access_token_set: Boolean(token),
    whatsapp_access_token_hint: maskSecret(token),
    whatsapp_phone_number_id: phoneId,
    whatsapp_business_account_id: settings.whatsapp_business_account_id,
    whatsapp_verify_token_set: Boolean(settings.whatsapp_verify_token),
    whatsapp_verify_token_hint: maskSecret(settings.whatsapp_verify_token),
    classification_prompt: settings.classification_prompt,
    ai_engine_enabled: settings.ai_engine_enabled,
    whatsapp_connected: Boolean(token && phoneId),
    updated_at: settings.updated_at,
  };
}

export async function ensureWorkspaceForUser(input?: {
  preferredName?: string;
  supportEmail?: string | null;
}): Promise<BusinessActionResult> {
  const { data: authData, error: authError } = await getCurrentUser();

  if (authError || !authData.user) {
    return { ok: false, error: "Debes iniciar sesión." };
  }

  const user = authData.user;
  const { data: membership, error: membershipError } =
    await businessRepository.findMembershipByUserId(user.id);

  if (membershipError) {
    return {
      ok: false,
      error:
        "No se pudo consultar tu empresa. ¿Ejecutaste la migración SQL en Supabase?",
    };
  }

  let businessId = membership?.business_id;

  if (!businessId) {
    const preferredName =
      input?.preferredName?.trim() ||
      (typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : null) ||
      user.email?.split("@")[0] ||
      "Mi negocio";

    const baseSlug = slugify(preferredName) || "negocio";
    const slug = `${baseSlug}-${user.id.slice(0, 8)}`;

    const { data: createdId, error: createError } =
      await businessRepository.createBusinessForCurrentUser({
        name: preferredName,
        slug,
        supportEmail: input?.supportEmail ?? user.email ?? null,
      });

    if (createError || !createdId) {
      return {
        ok: false,
        error:
          createError?.message ??
          "No se pudo crear la empresa. Revisa la migración SQL en Supabase.",
      };
    }

    businessId = createdId as string;
  }

  return getWorkspaceByBusinessId(businessId);
}

export async function getWorkspaceByBusinessId(
  businessId: string,
): Promise<BusinessActionResult> {
  const { data: authData, error: authError } = await getCurrentUser();

  if (authError || !authData.user) {
    return { ok: false, error: "Debes iniciar sesión." };
  }

  const [{ data: business, error: businessError }, { data: membership }, { data: settings, error: settingsError }] =
    await Promise.all([
      businessRepository.findBusinessById(businessId),
      businessRepository.findMembershipByUserId(authData.user.id),
      businessRepository.findSettingsByBusinessId(businessId),
    ]);

  if (businessError || !business) {
    return { ok: false, error: "No se encontró la empresa." };
  }

  if (!membership || membership.business_id !== businessId) {
    return { ok: false, error: "No tienes acceso a esta empresa." };
  }

  if (settingsError || !settings) {
    return { ok: false, error: "No se encontró la configuración de la empresa." };
  }

  return {
    ok: true,
    workspace: {
      business,
      membership,
      settings: toPublicSettings(settings),
    },
  };
}

export async function getCurrentWorkspace(): Promise<BusinessActionResult> {
  return ensureWorkspaceForUser();
}

export async function updateGeneral(
  input: UpdateBusinessGeneralInput,
): Promise<BusinessActionResult> {
  const parsed = updateBusinessGeneralSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: formatZodIssues(parsed.error) };
  }

  const workspaceResult = await getCurrentWorkspace();

  if (!workspaceResult.ok || !workspaceResult.workspace) {
    return workspaceResult;
  }

  const { business } = workspaceResult.workspace;
  const supportEmail =
    parsed.data.support_email && parsed.data.support_email.length > 0
      ? parsed.data.support_email
      : null;

  const { error } = await businessRepository.updateBusiness(business.id, {
    name: parsed.data.name,
    support_email: supportEmail,
    timezone: parsed.data.timezone,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const refreshed = await getWorkspaceByBusinessId(business.id);

  if (!refreshed.ok) {
    return refreshed;
  }

  return {
    ok: true,
    message: "Datos generales guardados.",
    workspace: refreshed.workspace,
  };
}

export async function updateIntegrations(
  input: UpdateBusinessIntegrationsInput,
): Promise<BusinessActionResult> {
  const parsed = updateBusinessIntegrationsSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: formatZodIssues(parsed.error) };
  }

  const workspaceResult = await getCurrentWorkspace();

  if (!workspaceResult.ok || !workspaceResult.workspace) {
    return workspaceResult;
  }

  const { business } = workspaceResult.workspace;
  const patch: Parameters<typeof businessRepository.updateSettings>[1] = {};

  if (isSecretProvided(parsed.data.openai_api_key)) {
    patch.openai_api_key = parsed.data.openai_api_key?.trim();
  }

  if (isSecretProvided(parsed.data.whatsapp_access_token)) {
    patch.whatsapp_access_token = parsed.data.whatsapp_access_token?.trim();
  }

  if (typeof parsed.data.whatsapp_phone_number_id === "string") {
    patch.whatsapp_phone_number_id =
      parsed.data.whatsapp_phone_number_id.trim() || null;
  }

  if (typeof parsed.data.whatsapp_business_account_id === "string") {
    patch.whatsapp_business_account_id =
      parsed.data.whatsapp_business_account_id.trim() || null;
  }

  if (isSecretProvided(parsed.data.whatsapp_verify_token)) {
    patch.whatsapp_verify_token = parsed.data.whatsapp_verify_token?.trim();
  }

  if (Object.keys(patch).length === 0) {
    return {
      ok: true,
      message: "Sin cambios en integraciones.",
      workspace: workspaceResult.workspace,
    };
  }

  const { error } = await businessRepository.updateSettings(business.id, patch);

  if (error) {
    return { ok: false, error: error.message };
  }

  const refreshed = await getWorkspaceByBusinessId(business.id);

  if (!refreshed.ok) {
    return refreshed;
  }

  return {
    ok: true,
    message: "Integraciones guardadas.",
    workspace: refreshed.workspace,
  };
}

export async function updateAi(
  input: UpdateBusinessAiInput,
): Promise<BusinessActionResult> {
  const parsed = updateBusinessAiSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: formatZodIssues(parsed.error) };
  }

  const workspaceResult = await getCurrentWorkspace();

  if (!workspaceResult.ok || !workspaceResult.workspace) {
    return workspaceResult;
  }

  const { business } = workspaceResult.workspace;

  const { error } = await businessRepository.updateSettings(business.id, {
    ai_engine_enabled: parsed.data.ai_engine_enabled,
    classification_prompt: parsed.data.classification_prompt.trim(),
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const refreshed = await getWorkspaceByBusinessId(business.id);

  if (!refreshed.ok) {
    return refreshed;
  }

  return {
    ok: true,
    message: "Motor de IA actualizado.",
    workspace: refreshed.workspace,
  };
}
