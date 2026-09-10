import { NextResponse } from "next/server";

import { ROUTES } from "@/config/app";
import { getOptionalServerEnv, getPublicEnv } from "@/lib/env";
import {
  META_OAUTH_STATE_COOKIE,
  META_OAUTH_STATE_TTL_SECONDS,
  createMetaOAuthState,
  statesMatch,
  verifyMetaOAuthState,
} from "@/lib/meta/oauth-state";
import { getCurrentUser } from "@/repositories/auth.repository";
import * as businessRepository from "@/repositories/business.repository";
import * as businessService from "@/services/business/business.service";

const GRAPH_VERSION = "v21.0";

/**
 * Dominio público de la app. Nunca usar el dashboard de Vercel
 * (`vercel.com/<team>/<project>`).
 */
function normalizePublicAppUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    // Dashboard / consola de Vercel — no es el origen de la app.
    if (url.hostname === "vercel.com") {
      return null;
    }
    return url.origin.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function appBaseUrl(): string {
  // Preferir APP_URL server-side (runtime) para no depender solo del inline de build.
  const fromServer = normalizePublicAppUrl(process.env.APP_URL);
  if (fromServer) return fromServer;

  const fromPublic = normalizePublicAppUrl(process.env.NEXT_PUBLIC_APP_URL);
  if (fromPublic) return fromPublic;

  return "http://localhost:3000";
}

export function metaOAuthCallbackUrl(): string {
  return `${appBaseUrl()}/api/oauth/meta/callback`;
}

export function settingsRedirect(
  status: "success" | "error" | "pending",
  reason?: string,
) {
  const url = new URL(ROUTES.configuracion, `${appBaseUrl()}/`);
  url.searchParams.set("tab", "integraciones");
  url.searchParams.set("whatsapp", status);
  if (reason) {
    url.searchParams.set("reason", reason.slice(0, 120));
  }
  return url;
}

function clearStateCookie(response: NextResponse) {
  response.cookies.set(META_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

function setStateCookie(response: NextResponse, token: string) {
  response.cookies.set(META_OAUTH_STATE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: META_OAUTH_STATE_TTL_SECONDS,
  });
}

function canManageIntegrations(role: string): boolean {
  return role === "owner" || role === "admin";
}

function resolveMetaAppId(): string | null {
  const env = getOptionalServerEnv();
  return env.META_APP_ID ?? process.env.NEXT_PUBLIC_META_APP_ID ?? null;
}

function resolveMetaConfigId(): string | null {
  const env = getOptionalServerEnv();
  return (
    env.META_LOGIN_CONFIG_ID ??
    process.env.NEXT_PUBLIC_META_LOGIN_CONFIG_ID ??
    null
  );
}

type TokenExchangeResult =
  | {
      ok: true;
      accessToken: string;
      expiresIn: number | null;
    }
  | { ok: false; error: string };

async function exchangeCodeForToken(input: {
  code: string;
  redirectUri?: string | null;
}): Promise<TokenExchangeResult> {
  const env = getOptionalServerEnv();
  const appId = resolveMetaAppId();
  const appSecret = env.META_APP_SECRET;

  if (!appId || !appSecret) {
    return { ok: false, error: "Credenciales de Meta incompletas." };
  }

  const url = new URL(
    `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`,
  );
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("code", input.code);
  if (input.redirectUri) {
    url.searchParams.set("redirect_uri", input.redirectUri);
  }

  const response = await fetch(url.toString(), { method: "GET" });
  const json = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };

  if (!response.ok || !json.access_token) {
    return {
      ok: false,
      error: json.error?.message ?? "No se pudo intercambiar el código OAuth.",
    };
  }

  return {
    ok: true,
    accessToken: json.access_token,
    expiresIn:
      typeof json.expires_in === "number" && Number.isFinite(json.expires_in)
        ? json.expires_in
        : null,
  };
}

async function subscribeWabaToApp(input: {
  wabaId: string;
  accessToken: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(input.wabaId)}/subscribed_apps`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
      },
      cache: "no-store",
    },
  );

  const json = (await response.json()) as {
    success?: boolean;
    error?: { message?: string };
  };

  if (!response.ok || json.success === false) {
    return {
      ok: false,
      error: json.error?.message ?? "No se pudo suscribir la WABA al webhook.",
    };
  }

  return { ok: true };
}

async function resolvePhoneNumberId(input: {
  wabaId: string;
  accessToken: string;
  preferredPhoneNumberId?: string | null;
}): Promise<{
  phoneNumberId: string | null;
  displayPhone: string | null;
}> {
  if (input.preferredPhoneNumberId?.trim()) {
    const detail = await fetchPhoneDetails(
      input.preferredPhoneNumberId.trim(),
      input.accessToken,
    );
    return {
      phoneNumberId: input.preferredPhoneNumberId.trim(),
      displayPhone: detail.displayPhone,
    };
  }

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(input.wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name`,
    {
      headers: { Authorization: `Bearer ${input.accessToken}` },
      cache: "no-store",
    },
  );

  const json = (await response.json()) as {
    data?: Array<{ id?: string; display_phone_number?: string }>;
    error?: { message?: string };
  };

  const first = json.data?.[0];
  if (!first?.id) {
    return { phoneNumberId: null, displayPhone: null };
  }

  return {
    phoneNumberId: first.id,
    displayPhone: first.display_phone_number ?? null,
  };
}

async function fetchPhoneDetails(
  phoneNumberId: string,
  accessToken: string,
): Promise<{ displayPhone: string | null }> {
  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name,is_on_biz_app,platform_type`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );

  const json = (await response.json()) as {
    display_phone_number?: string;
    error?: { message?: string };
  };

  return { displayPhone: json.display_phone_number ?? null };
}

async function assertStateAndMembership(input: {
  stateFromQuery: string | null;
  stateFromCookie: string | null;
}): Promise<
  | {
      ok: true;
      userId: string;
      businessId: string;
    }
  | { ok: false; error: string }
> {
  if (!statesMatch(input.stateFromQuery, input.stateFromCookie)) {
    return { ok: false, error: "State CSRF no válido." };
  }

  const verified = verifyMetaOAuthState(input.stateFromQuery);
  if (!verified.ok) {
    return { ok: false, error: verified.error };
  }

  const { data: authData, error: authError } = await getCurrentUser();
  if (authError || !authData.user) {
    return { ok: false, error: "Sesión requerida." };
  }

  if (authData.user.id !== verified.payload.userId) {
    return { ok: false, error: "El state no pertenece a la sesión actual." };
  }

  const membership = await businessRepository.findMembershipByUserId(
    authData.user.id,
  );
  if (membership.error || !membership.data) {
    return { ok: false, error: "Sin membresía de empresa." };
  }

  if (membership.data.business_id !== verified.payload.businessId) {
    return { ok: false, error: "La empresa del state no coincide." };
  }

  if (!canManageIntegrations(membership.data.role)) {
    return { ok: false, error: "Sin permiso para conectar WhatsApp." };
  }

  const workspace = await businessService.getCurrentWorkspace();
  if (
    !workspace.ok ||
    !workspace.workspace ||
    workspace.workspace.business.id !== verified.payload.businessId
  ) {
    return { ok: false, error: "Empresa activa no coincide con el state." };
  }

  return {
    ok: true,
    userId: authData.user.id,
    businessId: verified.payload.businessId,
  };
}

/**
 * Prepara Embedded Signup: cookie state + datos públicos para FB.login.
 * No redirige a Meta (eso lo hace el SDK en el cliente).
 */
export async function prepareEmbeddedSignup(): Promise<
  | {
      ok: true;
      response: NextResponse;
    }
  | { ok: false; status: number; error: string }
> {
  const { data: authData, error: authError } = await getCurrentUser();
  if (authError || !authData.user) {
    return { ok: false, status: 401, error: "Debes iniciar sesión." };
  }

  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return { ok: false, status: 400, error: "Sin empresa activa." };
  }

  if (!canManageIntegrations(workspace.workspace.membership.role)) {
    return { ok: false, status: 403, error: "Sin permiso." };
  }

  const env = getOptionalServerEnv();
  const appId = resolveMetaAppId();
  const configId = resolveMetaConfigId();

  if (!env.META_APP_SECRET || !appId || !configId) {
    return {
      ok: false,
      status: 500,
      error:
        "Faltan META_APP_SECRET, META_APP_ID/NEXT_PUBLIC_META_APP_ID o META_LOGIN_CONFIG_ID.",
    };
  }

  const callbackUrl = metaOAuthCallbackUrl();
  if (
    callbackUrl.includes("vercel.com/") &&
    !callbackUrl.includes(".vercel.app/")
  ) {
    return {
      ok: false,
      status: 500,
      error:
        "NEXT_PUBLIC_APP_URL/APP_URL inválida (parece URL del dashboard de Vercel). Usa https://wssp-crm.vercel.app",
    };
  }

  const { token } = createMetaOAuthState({
    userId: authData.user.id,
    businessId: workspace.workspace.business.id,
  });

  await businessRepository.updateSettings(workspace.workspace.business.id, {
    whatsapp_connection_status: "pending",
  });

  const body = {
    ok: true as const,
    state: token,
    appId,
    configId,
    graphVersion: GRAPH_VERSION,
    coexistenceFeatureType: "whatsapp_business_app_onboarding" as const,
    redirectUri: callbackUrl,
    appUrl: appBaseUrl(),
  };

  const response = NextResponse.json(body);
  setStateCookie(response, token);
  return { ok: true, response };
}

export async function handleMetaOAuthCallback(input: {
  code: string | null;
  state: string | null;
  error: string | null;
  errorDescription: string | null;
  stateCookie: string | null;
}): Promise<NextResponse> {
  if (input.error) {
    const response = NextResponse.redirect(
      settingsRedirect("error", input.error.slice(0, 40)),
    );
    clearStateCookie(response);
    return response;
  }

  const gate = await assertStateAndMembership({
    stateFromQuery: input.state,
    stateFromCookie: input.stateCookie,
  });

  if (!gate.ok) {
    const response = NextResponse.redirect(
      settingsRedirect("error", "state_invalido"),
    );
    clearStateCookie(response);
    return response;
  }

  // El flujo principal es Embedded Signup → /complete.
  // El callback solo confirma y vuelve a Integraciones.
  const response = NextResponse.redirect(
    settingsRedirect(input.code ? "pending" : "error", "usar_embedded_signup"),
  );
  // Conservamos cookie state un momento por si el SDK aún completa.
  return response;
}

export async function completeMetaOAuth(input: {
  code: string;
  state: string;
  stateCookie: string | null;
  wabaId?: string | null;
  phoneNumberId?: string | null;
  coexistence?: boolean;
}): Promise<
  | {
      ok: true;
      message: string;
      phoneNumberId: string | null;
      wabaId: string | null;
      displayPhone: string | null;
      coexistence: boolean;
    }
  | { ok: false; error: string; status: number }
> {
  const gate = await assertStateAndMembership({
    stateFromQuery: input.state,
    stateFromCookie: input.stateCookie,
  });

  if (!gate.ok) {
    return { ok: false, error: gate.error, status: 403 };
  }

  const exchanged = await exchangeCodeForToken({
    code: input.code,
    // Debe coincidir exactamente con el redirect_uri del login/dialog.
    redirectUri: metaOAuthCallbackUrl(),
  });

  if (!exchanged.ok) {
    await businessRepository.updateSettings(gate.businessId, {
      whatsapp_connection_status: "error",
    });
    return { ok: false, error: exchanged.error, status: 400 };
  }

  const wabaId = input.wabaId?.trim() || null;
  if (!wabaId) {
    await businessRepository.updateSettings(gate.businessId, {
      whatsapp_connection_status: "error",
    });
    return {
      ok: false,
      error: "Meta no devolvió WABA ID. Completa Embedded Signup de nuevo.",
      status: 400,
    };
  }

  const resolvedPhone = await resolvePhoneNumberId({
    wabaId,
    accessToken: exchanged.accessToken,
    preferredPhoneNumberId: input.phoneNumberId,
  });

  if (!resolvedPhone.phoneNumberId) {
    await businessRepository.updateSettings(gate.businessId, {
      whatsapp_access_token: exchanged.accessToken,
      whatsapp_business_account_id: wabaId,
      whatsapp_connection_status: "error",
    });
    return {
      ok: false,
      error:
        "No se obtuvo Phone Number ID. Revisa la cuenta WhatsApp en Meta Business.",
      status: 400,
    };
  }

  // Coexistence: no registrar el número (ya está en WhatsApp Business App).
  // Cloud API onboarding estándar también puede omitir register aquí si Meta
  // ya lo dejó listo vía Embedded Signup.
  const subscribed = await subscribeWabaToApp({
    wabaId,
    accessToken: exchanged.accessToken,
  });

  if (!subscribed.ok) {
    await businessRepository.updateSettings(gate.businessId, {
      whatsapp_access_token: exchanged.accessToken,
      whatsapp_business_account_id: wabaId,
      whatsapp_phone_number_id: resolvedPhone.phoneNumberId,
      whatsapp_display_phone: resolvedPhone.displayPhone,
      whatsapp_connection_status: "error",
      whatsapp_coexistence: Boolean(input.coexistence),
    });
    return {
      ok: false,
      error: subscribed.error,
      status: 502,
    };
  }

  const expiresAt =
    exchanged.expiresIn != null
      ? new Date(Date.now() + exchanged.expiresIn * 1000).toISOString()
      : null;

  const { error } = await businessRepository.updateSettings(gate.businessId, {
    whatsapp_access_token: exchanged.accessToken,
    whatsapp_token_expires_at: expiresAt,
    whatsapp_business_account_id: wabaId,
    whatsapp_phone_number_id: resolvedPhone.phoneNumberId,
    whatsapp_display_phone: resolvedPhone.displayPhone,
    whatsapp_connection_status: "connected",
    whatsapp_connected_at: new Date().toISOString(),
    whatsapp_coexistence: Boolean(input.coexistence),
  });

  if (error) {
    return { ok: false, error: "No se pudo guardar la conexión.", status: 500 };
  }

  return {
    ok: true,
    message: input.coexistence
      ? "WhatsApp conectado con coexistencia (Business App + Cloud API)."
      : "WhatsApp conectado.",
    phoneNumberId: resolvedPhone.phoneNumberId,
    wabaId,
    displayPhone: resolvedPhone.displayPhone,
    coexistence: Boolean(input.coexistence),
  };
}

export async function disconnectWhatsAppForCurrentBusiness(): Promise<
  | { ok: true; message: string }
  | { ok: false; error: string }
> {
  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return { ok: false, error: workspace.ok ? "Sin empresa." : workspace.error };
  }

  if (!canManageIntegrations(workspace.workspace.membership.role)) {
    return { ok: false, error: "Sin permiso." };
  }

  const { error } = await businessRepository.updateSettings(
    workspace.workspace.business.id,
    {
      whatsapp_access_token: null,
      whatsapp_phone_number_id: null,
      whatsapp_business_account_id: null,
      whatsapp_token_expires_at: null,
      whatsapp_display_phone: null,
      whatsapp_connection_status: "disconnected",
      whatsapp_connected_at: null,
      whatsapp_coexistence: false,
    },
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    message:
      "WhatsApp desconectado en Digitalmente CRM. La app de WhatsApp Business del cliente no se modifica.",
  };
}

export function assertPublicEnvLoaded() {
  getPublicEnv();
}
