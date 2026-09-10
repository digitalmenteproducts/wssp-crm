"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { BusinessSettingsPublic } from "@/types/business";

declare global {
  interface Window {
    FB?: {
      init: (params: {
        appId: string;
        cookie?: boolean;
        xfbml?: boolean;
        version: string;
      }) => void;
      login: (
        callback: (response: FbLoginResponse) => void,
        options: Record<string, unknown>,
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

type FbLoginResponse = {
  authResponse?: { code?: string } | null;
  status?: string;
};

type PrepareResponse = {
  ok: true;
  state: string;
  appId: string;
  configId: string;
  graphVersion: string;
  coexistenceFeatureType: string;
  redirectUri: string;
  appUrl: string;
};

type SessionInfo = {
  wabaId: string | null;
  phoneNumberId: string | null;
  coexistence: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  disconnected: "No conectado",
  pending: "Conectando",
  connected: "Conectado",
  error: "Error",
};

type WhatsAppConnectCardProps = {
  settings: BusinessSettingsPublic;
  oauthFeedback?: {
    status: string | null;
    reason: string | null;
  };
};

function loadFacebookSdk(appId: string, version: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.FB) {
      window.FB.init({
        appId,
        cookie: true,
        xfbml: false,
        version,
      });
      resolve();
      return;
    }

    window.fbAsyncInit = () => {
      window.FB?.init({
        appId,
        cookie: true,
        xfbml: false,
        version,
      });
      resolve();
    };

    const existing = document.getElementById("facebook-jssdk");
    if (existing) {
      return;
    }

    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.onerror = () => reject(new Error("No se pudo cargar el SDK de Meta."));
    document.body.appendChild(script);
  });
}

export function WhatsAppConnectCard({
  settings,
  oauthFeedback,
}: WhatsAppConnectCardProps) {
  const router = useRouter();
  const [connecting, setConnecting] = useState(false);
  const [localError, setLocalError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [useCoexistence, setUseCoexistence] = useState(true);

  const sessionRef = useRef<SessionInfo>({
    wabaId: null,
    phoneNumberId: null,
    coexistence: false,
  });

  const uiStatus = connecting
    ? "pending"
    : localError
      ? "error"
      : settings.whatsapp_connection_status;

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!event.origin.endsWith("facebook.com")) return;
      try {
        const payload =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (payload?.type !== "WA_EMBEDDED_SIGNUP") return;

        const eventName = String(payload.event ?? "");
        const data = (payload.data ?? {}) as {
          waba_id?: string;
          phone_number_id?: string;
        };

        const coexistence =
          eventName === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING";

        if (
          eventName === "FINISH" ||
          eventName === "FINISH_ONLY_WABA" ||
          coexistence
        ) {
          sessionRef.current = {
            wabaId: data.waba_id ?? sessionRef.current.wabaId,
            phoneNumberId:
              data.phone_number_id ?? sessionRef.current.phoneNumberId,
            coexistence: coexistence || sessionRef.current.coexistence,
          };
        }

        if (eventName === "CANCEL" || eventName === "ERROR") {
          setError(
            eventName === "CANCEL"
              ? "Conexión cancelada en Meta."
              : "Error en Embedded Signup de Meta.",
          );
          setLocalError(true);
          setConnecting(false);
          setBusy(false);
        }
      } catch {
        // Ignorar mensajes no JSON.
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const completeOnServer = useCallback(
    async (input: {
      code: string;
      state: string;
      coexistence: boolean;
    }) => {
      const session = sessionRef.current;
      const response = await fetch("/api/oauth/meta/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: input.code,
          state: input.state,
          waba_id: session.wabaId,
          phone_number_id: session.phoneNumberId,
          coexistence: input.coexistence || session.coexistence,
        }),
      });

      const json = (await response.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok || !json.ok) {
        throw new Error(json.error ?? "No se pudo completar la conexión.");
      }

      return json.message ?? "WhatsApp conectado.";
    },
    [],
  );

  const connect = useCallback(async () => {
    setBusy(true);
    setConnecting(true);
    setLocalError(false);
    setError(null);
    setMessage(null);
    sessionRef.current = {
      wabaId: null,
      phoneNumberId: null,
      coexistence: useCoexistence,
    };

    try {
      const prepareRes = await fetch("/api/oauth/meta/start", {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      const prepared = (await prepareRes.json()) as
        | PrepareResponse
        | { ok?: false; error?: string };

      if (!prepareRes.ok || !("ok" in prepared) || !prepared.ok) {
        throw new Error(
          ("error" in prepared && prepared.error) ||
            "No se pudo preparar Embedded Signup.",
        );
      }

      await loadFacebookSdk(prepared.appId, prepared.graphVersion);

      if (!window.FB) {
        throw new Error("SDK de Meta no disponible.");
      }

      const extras: Record<string, unknown> = {
        setup: {},
        sessionInfoVersion: "3",
      };

      if (useCoexistence) {
        extras.featureType = prepared.coexistenceFeatureType;
      }

      await new Promise<void>((resolve, reject) => {
        window.FB!.login(
          (response) => {
            void (async () => {
              try {
                const code = response.authResponse?.code;
                if (!code) {
                  reject(
                    new Error(
                      "No se recibió authorization code. ¿Se cerró el popup?",
                    ),
                  );
                  return;
                }

                // Dar tiempo al postMessage de session info.
                await new Promise((r) => setTimeout(r, 400));

                const okMessage = await completeOnServer({
                  code,
                  state: prepared.state,
                  coexistence: useCoexistence,
                });
                setMessage(okMessage);
                setConnecting(false);
                setLocalError(false);
                resolve();
                router.refresh();
              } catch (err) {
                reject(err);
              }
            })();
          },
          {
            config_id: prepared.configId,
            response_type: "code",
            override_default_response_type: true,
            // Debe coincidir con Valid OAuth Redirect URIs en Meta y con /complete.
            redirect_uri: prepared.redirectUri,
            extras,
          },
        );
      });
    } catch (err) {
      const text =
        err instanceof Error ? err.message : "Error al conectar WhatsApp.";
      setError(text);
      setLocalError(true);
      setConnecting(false);
    } finally {
      setBusy(false);
    }
  }, [completeOnServer, router, useCoexistence]);

  const disconnect = useCallback(async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/oauth/meta/disconnect", {
        method: "POST",
        credentials: "same-origin",
      });
      const json = (await response.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
      if (!response.ok || !json.ok) {
        throw new Error(json.error ?? "No se pudo desconectar.");
      }
      setMessage(json.message ?? "WhatsApp desconectado.");
      setConnecting(false);
      setLocalError(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al desconectar.");
      setLocalError(true);
    } finally {
      setBusy(false);
    }
  }, [router]);

  const connected = uiStatus === "connected" || settings.whatsapp_connected;

  return (
    <div className="space-y-3 rounded-lg border border-outline-variant/40 bg-muted/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-on-surface">
            WhatsApp Business
          </p>
          <p className="text-xs text-secondary">
            Estado: {STATUS_LABEL[uiStatus] ?? uiStatus}
            {busy && uiStatus === "pending" ? "…" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {connected ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void connect()}
                className="h-10 rounded-lg px-4 text-sm"
              >
                Reconectar
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void disconnect()}
                className="h-10 rounded-lg px-4 text-sm"
              >
                Desconectar
              </Button>
            </>
          ) : (
            <Button
              type="button"
              disabled={busy}
              onClick={() => void connect()}
              className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {busy ? "Conectando…" : "Conectar WhatsApp"}
            </Button>
          )}
        </div>
      </div>

      {connected ? (
        <dl className="grid gap-2 text-xs text-secondary sm:grid-cols-2">
          <div>
            <dt className="font-medium text-on-surface">Número</dt>
            <dd className="font-mono">
              {settings.whatsapp_display_phone ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-on-surface">WABA</dt>
            <dd className="font-mono">
              {settings.whatsapp_business_account_id ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-on-surface">Phone Number ID</dt>
            <dd className="font-mono">
              {settings.whatsapp_phone_number_id ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-on-surface">Conectado</dt>
            <dd>
              {settings.whatsapp_connected_at
                ? new Date(settings.whatsapp_connected_at).toLocaleString("es")
                : "—"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-medium text-on-surface">Coexistencia</dt>
            <dd>
              {settings.whatsapp_coexistence
                ? "Sí (WhatsApp Business App + Cloud API)"
                : "No (solo Cloud API)"}
            </dd>
          </div>
        </dl>
      ) : (
        <label className="flex items-start gap-2 text-xs text-secondary">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={useCoexistence}
            disabled={busy}
            onChange={(e) => setUseCoexistence(e.target.checked)}
          />
          <span>
            Coexistencia con WhatsApp Business App (recomendado para el piloto).
            Deja la app móvil funcionando y conecta Cloud API sin migración
            destructiva.
          </span>
        </label>
      )}

      <p className="text-xs text-secondary">
        Usa Embedded Signup oficial de Meta. Los tokens se guardan solo en
        servidor y nunca se muestran aquí. Prueba primero con activos de
        desarrollo; no conectes aún el número real del piloto.
      </p>

      {oauthFeedback?.status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          No se pudo completar la conexión
          {oauthFeedback.reason ? ` (${oauthFeedback.reason})` : ""}.
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-primary" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
