import { NextResponse } from "next/server";

import { ROUTES } from "@/config/app";
import {
  getOptionalServerEnv,
  getPublicEnv,
} from "@/lib/env";
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

function appBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  return "http://localhost:3000";
}

export function metaOAuthCallbackUrl(): string {
  return `${appBaseUrl()}/api/oauth/meta/callback`;
}

export function settingsRedirect(status: "success" | "error" | "pending", reason?: string) {
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

export async function startMetaOAuth(): Promise<NextResponse> {
  const { data: authData, error: authError } = await getCurrentUser();
  if (authError || !authData.user) {
    const url = new URL(ROUTES.login, `${appBaseUrl()}/`);
    url.searchParams.set("next", ROUTES.configuracion);
    return NextResponse.redirect(url);
  }

  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return NextResponse.redirect(
      settingsRedirect("error", "sin_empresa"),
    );
  }

  if (!canManageIntegrations(workspace.workspace.membership.role)) {
    return NextResponse.redirect(
      settingsRedirect("error", "sin_permiso"),
    );
  }

  const env = getOptionalServerEnv();
  const appId = env.META_APP_ID ?? process.env.NEXT_PUBLIC_META_APP_ID;
  if (!env.META_APP_SECRET || !appId) {
    return NextResponse.redirect(
      settingsRedirect("error", "meta_env_faltante"),
    );
  }

  const { token } = createMetaOAuthState({
    userId: authData.user.id,
    businessId: workspace.workspace.business.id,
  });

  const authUrl = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  authUrl.searchParams.set("client_id", appId);
  authUrl.searchParams.set("redirect_uri", metaOAuthCallbackUrl());
  authUrl.searchParams.set("state", token);
  authUrl.searchParams.set("response_type", "code");
  // Scopes mínimos; Embedded Signup completo usará config_id vía SDK.
  authUrl.searchParams.set(
    "scope",
    "whatsapp_business_management,whatsapp_business_messaging,business_management",
  );

  if (env.META_LOGIN_CONFIG_ID) {
    authUrl.searchParams.set("config_id", env.META_LOGIN_CONFIG_ID);
  }

  const response = NextResponse.redirect(authUrl.toString());
  setStateCookie(response, token);

  // Marca pending sin tocar credenciales existentes.
  await businessRepository.updateSettings(workspace.workspace.business.id, {
    whatsapp_connection_status: "pending",
  });

  return response;
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
  const appId = env.META_APP_ID ?? process.env.NEXT_PUBLIC_META_APP_ID;
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

  // Confirma que el workspace activo es el del state (primera membresía hoy).
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

  if (!input.code) {
    const response = NextResponse.redirect(
      settingsRedirect("error", "sin_codigo"),
    );
    clearStateCookie(response);
    return response;
  }

  const exchanged = await exchangeCodeForToken({
    code: input.code,
    redirectUri: metaOAuthCallbackUrl(),
  });

  if (!exchanged.ok) {
    await businessRepository.updateSettings(gate.businessId, {
      whatsapp_connection_status: "error",
    });
    const response = NextResponse.redirect(
      settingsRedirect("error", "exchange_fallido"),
    );
    clearStateCookie(response);
    return response;
  }

  const expiresAt =
    exchanged.expiresIn != null
      ? new Date(Date.now() + exchanged.expiresIn * 1000).toISOString()
      : null;

  // Callback redirect: guarda token. WABA/phone llegan vía /complete (SDK).
  const { error } = await businessRepository.updateSettings(gate.businessId, {
    whatsapp_access_token: exchanged.accessToken,
    whatsapp_token_expires_at: expiresAt,
    whatsapp_connection_status: "pending",
    whatsapp_connected_at: new Date().toISOString(),
  });

  if (error) {
    const response = NextResponse.redirect(
      settingsRedirect("error", "persistencia"),
    );
    clearStateCookie(response);
    return response;
  }

  const response = NextResponse.redirect(settingsRedirect("pending"));
  clearStateCookie(response);
  return response;
}

export async function completeMetaOAuth(input: {
  code: string;
  state: string;
  stateCookie: string | null;
  wabaId?: string | null;
  phoneNumberId?: string | null;
}): Promise<
  | { ok: true; message: string }
  | { ok: false; error: string; status: number }
> {
  const gate = await assertStateAndMembership({
    stateFromQuery: input.state,
    stateFromCookie: input.stateCookie,
  });

  if (!gate.ok) {
    return { ok: false, error: gate.error, status: 403 };
  }

  // Embedded Signup JS code exchange usually omits redirect_uri.
  const exchanged = await exchangeCodeForToken({
    code: input.code,
    redirectUri: null,
  });

  if (!exchanged.ok) {
    await businessRepository.updateSettings(gate.businessId, {
      whatsapp_connection_status: "error",
    });
    return { ok: false, error: exchanged.error, status: 400 };
  }

  const expiresAt =
    exchanged.expiresIn != null
      ? new Date(Date.now() + exchanged.expiresIn * 1000).toISOString()
      : null;

  const hasAssets = Boolean(input.wabaId?.trim() && input.phoneNumberId?.trim());

  const patch: Parameters<typeof businessRepository.updateSettings>[1] = {
    whatsapp_access_token: exchanged.accessToken,
    whatsapp_token_expires_at: expiresAt,
    whatsapp_connection_status: hasAssets ? "connected" : "pending",
    whatsapp_connected_at: new Date().toISOString(),
  };

  if (input.wabaId?.trim()) {
    patch.whatsapp_business_account_id = input.wabaId.trim();
  }
  if (input.phoneNumberId?.trim()) {
    patch.whatsapp_phone_number_id = input.phoneNumberId.trim();
  }

  const { error } = await businessRepository.updateSettings(
    gate.businessId,
    patch,
  );

  if (error) {
    return { ok: false, error: "No se pudo guardar la conexión.", status: 500 };
  }

  return {
    ok: true,
    message: hasAssets
      ? "WhatsApp conectado."
      : "Token guardado. Falta WABA/Phone Number ID (Embedded Signup SDK).",
  };
}

/** Solo para tipado / smoke: asegura que public env existe en rutas server. */
export function assertPublicEnvLoaded() {
  getPublicEnv();
}
