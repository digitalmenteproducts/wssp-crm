"use client";

import { useState } from "react";

import { AiSettingsForm } from "@/components/layout/ai-settings-form";
import { GeneralSettingsForm } from "@/components/layout/general-settings-form";
import { IntegrationsSettingsForm } from "@/components/layout/integrations-settings-form";
import { cn } from "@/lib/utils";
import type { BusinessWorkspace } from "@/types/business";

type SettingsTab = "general" | "integraciones" | "ia";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "integraciones", label: "Integraciones" },
  { id: "ia", label: "Motor de IA" },
];

type SettingsTabsProps = {
  workspace: BusinessWorkspace;
  webhookUrl: string;
};

export function SettingsTabs({ workspace, webhookUrl }: SettingsTabsProps) {
  const [tab, setTab] = useState<SettingsTab>("general");
  const connected = workspace.settings.whatsapp_connected;

  return (
    <div>
      <div className="mb-8 flex space-x-8 border-b border-outline-variant/40">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "-mb-px border-b-2 px-1 pb-3 text-sm font-semibold transition-colors",
              tab === item.id
                ? "border-primary text-primary"
                : "border-transparent text-secondary hover:text-on-surface",
            )}
          >
            {item.label}
          </button>
        ))}
        <span className="cursor-not-allowed px-1 pb-3 text-sm text-outline">
          Equipo
        </span>
        <span className="cursor-not-allowed px-1 pb-3 text-sm text-outline">
          Facturación
        </span>
      </div>

      {tab === "general" ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-outline-variant/50 bg-card p-6 shadow-sm lg:col-span-2">
            <h3 className="text-lg font-semibold text-on-surface">
              Perfil de la organización
            </h3>
            <p className="mb-6 text-sm text-on-surface-variant">
              Información básica de tu empresa.
            </p>
            <GeneralSettingsForm business={workspace.business} />
          </div>

          <div className="flex flex-col rounded-xl border border-outline-variant/50 bg-card p-6 shadow-sm">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-on-surface">
                  API de WhatsApp
                </h3>
                <p className="text-sm text-on-surface-variant">
                  Estado de la conexión
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[11px] tracking-wider uppercase",
                  connected
                    ? "bg-green-100 text-green-800"
                    : "bg-muted text-secondary",
                )}
              >
                <span
                  className={cn(
                    "inline-block size-1.5 rounded-full",
                    connected ? "bg-green-500" : "bg-outline",
                  )}
                />
                {connected ? "Conectado" : "Pendiente"}
              </span>
            </div>

            <div className="mt-4 mb-auto rounded-lg border border-outline-variant/30 bg-muted/50 p-4">
              <p className="text-sm font-medium text-on-surface">
                {workspace.settings.whatsapp_phone_number_id ||
                  "Phone Number ID no configurado"}
              </p>
              <p className="text-xs text-on-surface-variant">
                Cuenta de empresa · token{" "}
                {workspace.settings.whatsapp_access_token_set
                  ? workspace.settings.whatsapp_access_token_hint
                  : "sin configurar"}
              </p>
            </div>

            <p className="mt-4 text-xs text-secondary">
              Completa las credenciales en la pestaña Integraciones.
            </p>
          </div>
        </div>
      ) : null}

      {tab === "integraciones" ? (
        <div className="rounded-xl border border-outline-variant/50 bg-card p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-on-surface">
            Integraciones
          </h3>
          <p className="mb-6 text-sm text-on-surface-variant">
            OpenAI, WhatsApp Cloud API y URL del webhook.
          </p>
          <IntegrationsSettingsForm
            settings={workspace.settings}
            webhookUrl={webhookUrl}
          />
        </div>
      ) : null}

      {tab === "ia" ? (
        <div className="rounded-xl border border-outline-variant/50 bg-card p-6 shadow-sm">
          <h3 className="mb-1 flex items-center gap-2 text-lg font-semibold text-on-surface">
            Reglas del motor de IA
          </h3>
          <p className="mb-6 text-sm text-on-surface-variant">
            Define el prompt de clasificación para conversaciones de WhatsApp.
          </p>
          <AiSettingsForm settings={workspace.settings} />
        </div>
      ) : null}
    </div>
  );
}
