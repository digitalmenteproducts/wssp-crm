import { selectActiveMembership } from "@/lib/active-business";
import {
  persistActiveBusiness,
  readActiveBusinessPreference,
} from "@/lib/active-business-cookie";
import { isSecretProvided, slugify } from "@/lib/business";
import * as businessRepository from "@/repositories/business.repository";
import * as businessSecretsRepository from "@/repositories/business-secrets.repository";
import type { BusinessSecretsStatus } from "@/repositories/business-secrets.repository";
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
  BusinessUser,
  BusinessWorkspace,
} from "@/types/business";

export type BusinessActionResult =
  | { ok: true; message?: string; workspace?: BusinessWorkspace }
  | { ok: false; error: string };

function formatZodIssues(error: { issues: { message: string }[] }): string {
  return error.issues.map((issue) => issue.message).join(" ");
}

function canManageBusinessSecrets(role: string): boolean {
  return role === "owner" || role === "admin";
}

function toPublicSettings(
  settings: BusinessSettings,
  secrets: BusinessSecretsStatus,
): BusinessSettingsPublic {
  const phoneId = settings.whatsapp_phone_number_id;
  const status = settings.whatsapp_connection_status ?? "disconnected";

  return {
    business_id: settings.business_id,
    openai_api_key_set: secrets.openai_api_key_set,
    openai_api_key_hint: secrets.openai_api_key_hint,
    whatsapp_access_token_set: secrets.whatsapp_access_token_set,
    whatsapp_access_token_hint: secrets.whatsapp_access_token_hint,
    whatsapp_phone_number_id: phoneId,
    whatsapp_business_account_id: settings.whatsapp_business_account_id,
    whatsapp_verify_token_set: secrets.whatsapp_verify_token_set,
    whatsapp_verify_token_hint: secrets.whatsapp_verify_token_hint,
    whatsapp_token_expires_at: settings.whatsapp_token_expires_at ?? null,
    whatsapp_connection_status: status,
    whatsapp_connected_at: settings.whatsapp_connected_at ?? null,
    whatsapp_display_phone: settings.whatsapp_display_phone ?? null,
    whatsapp_coexistence: Boolean(settings.whatsapp_coexistence),
    classification_prompt: settings.classification_prompt,
    ai_engine_enabled: settings.ai_engine_enabled,
    whatsapp_connected:
      status === "connected" ||
      Boolean(secrets.whatsapp_access_token_set && phoneId),
    updated_at: settings.updated_at,
  };
}

export async function ensureWorkspaceForUser(input?: {
  preferredName?: string;
  supportEmail?: string | null;
}): Promise<BusinessActionResult> {
  const resolved = await resolveWorkspace();
  if (resolved.kind !== "no_membership") {
    return resolved.result;
  }

  // Solo se crea negocio si el usuario no tiene ninguna membership.
  // Con invitaciones, aquí se aceptará la invitación pendiente en su lugar.
  const { data: authData, error: authError } = await getCurrentUser();
  if (authError || !authData.user) {
    return { ok: false, error: "Debes iniciar sesión." };
  }

  const user = authData.user;
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

  const created = await resolveWorkspace();
  return created.kind === "no_membership"
    ? { ok: false, error: "No se pudo crear la empresa." }
    : created.result;
}

type WorkspaceResolution =
  | { kind: "resolved"; result: BusinessActionResult }
  | { kind: "no_membership" }
  | { kind: "error"; result: BusinessActionResult };

/**
 * Único punto que decide el negocio de la sesión.
 * La preferencia (cookie) solo se acepta si coincide con una membership del
 * usuario autenticado; si no, se descarta y se usa una membership válida.
 */
async function resolveWorkspace(): Promise<WorkspaceResolution> {
  const { data: authData, error: authError } = await getCurrentUser();

  if (authError || !authData.user) {
    return { kind: "error", result: { ok: false, error: "Debes iniciar sesión." } };
  }

  const [memberships, preference] = await Promise.all([
    businessRepository.listMembershipsByUserId(authData.user.id),
    readActiveBusinessPreference(),
  ]);

  if (memberships.error) {
    return {
      kind: "error",
      result: {
        ok: false,
        error: `No se pudo consultar tu empresa: ${memberships.error}`,
      },
    };
  }

  const selection = selectActiveMembership(memberships.data, preference);
  if (!selection) {
    return { kind: "no_membership" };
  }

  if (selection.membership.business_id !== preference) {
    await persistActiveBusiness(selection.membership.business_id);
  }

  return { kind: "resolved", result: await loadWorkspace(selection.membership) };
}

/** Workspace actual sin crear negocio si el usuario no tiene memberships. */
export async function resolveCurrentWorkspace(): Promise<BusinessActionResult> {
  const resolved = await resolveWorkspace();
  return resolved.kind === "no_membership"
    ? { ok: false, error: "No perteneces a ninguna empresa." }
    : resolved.result;
}

async function loadWorkspace(
  membership: BusinessUser,
): Promise<BusinessActionResult> {
  const businessId = membership.business_id;
  const [{ data: business, error: businessError }, { data: settings, error: settingsError }] =
    await Promise.all([
      businessRepository.findBusinessById(businessId),
      businessRepository.findSettingsByBusinessId(businessId),
    ]);

  if (businessError || !business) {
    return { ok: false, error: "No se encontró la empresa." };
  }

  if (settingsError || !settings) {
    return { ok: false, error: "No se encontró la configuración de la empresa." };
  }

  const secretsStatus = await businessSecretsRepository.getSecretsStatus(businessId);
  if (secretsStatus.error !== null) {
    return { ok: false, error: "No se pudo leer el estado de las integraciones." };
  }

  const industry =
    business.industry &&
    [
      "clinic",
      "restaurant",
      "ecommerce",
      "real_estate",
      "legal",
      "tourism",
      "services",
      "other",
    ].includes(business.industry)
      ? business.industry
      : "other";

  return {
    ok: true,
    workspace: {
      business: { ...business, industry },
      membership,
      settings: toPublicSettings(settings, secretsStatus.data),
    },
  };
}

/**
 * Punto de entrada del resto de la app. Delega en la resolución centralizada;
 * solo crea negocio si el usuario no tiene ninguna membership.
 */
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

  const refreshed = await resolveCurrentWorkspace();

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

  const { business, membership } = workspaceResult.workspace;

  if (!canManageBusinessSecrets(membership.role)) {
    return { ok: false, error: "Sin permiso para modificar integraciones." };
  }

  const patch: businessSecretsRepository.BusinessSecretsPatch = {};

  if (isSecretProvided(parsed.data.openai_api_key)) {
    patch.openai_api_key = parsed.data.openai_api_key?.trim();
  }

  // Token / WABA / Phone Number ID solo vía Embedded Signup (oauth/meta/complete).
  // El formulario de Integraciones no debe sobrescribirlos con vacíos.

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

  const { error } = await businessSecretsRepository.updateSecrets(
    business.id,
    patch,
  );

  if (error) {
    return { ok: false, error: "No se pudieron guardar las integraciones." };
  }

  const refreshed = await resolveCurrentWorkspace();

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

  const refreshed = await resolveCurrentWorkspace();

  if (!refreshed.ok) {
    return refreshed;
  }

  return {
    ok: true,
    message: "Motor de IA actualizado.",
    workspace: refreshed.workspace,
  };
}
