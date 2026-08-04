"use client";

import { useActionState } from "react";

import {
  updateIntegrationsAction,
  type SettingsFormState,
} from "@/app/(dashboard)/configuracion/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BusinessSettingsPublic } from "@/types/business";

const initialState: SettingsFormState = {};

type IntegrationsSettingsFormProps = {
  settings: BusinessSettingsPublic;
  webhookUrl: string;
};

export function IntegrationsSettingsForm({
  settings,
  webhookUrl,
}: IntegrationsSettingsFormProps) {
  const [state, formAction, pending] = useActionState(
    updateIntegrationsAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <Label
          htmlFor="openai_api_key"
          className="font-mono text-xs tracking-wider text-on-surface-variant uppercase"
        >
          OpenAI API Key
        </Label>
        <Input
          id="openai_api_key"
          name="openai_api_key"
          type="password"
          autoComplete="off"
          placeholder={
            settings.openai_api_key_set
              ? `Configurada (${settings.openai_api_key_hint})`
              : "sk-..."
          }
          className="h-10 rounded-lg border-outline-variant bg-card font-mono text-sm"
        />
        <p className="text-xs text-secondary">
          Déjalo vacío para conservar el valor actual.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label
            htmlFor="whatsapp_access_token"
            className="font-mono text-xs tracking-wider text-on-surface-variant uppercase"
          >
            WhatsApp Access Token
          </Label>
          <Input
            id="whatsapp_access_token"
            name="whatsapp_access_token"
            type="password"
            autoComplete="off"
            placeholder={
              settings.whatsapp_access_token_set
                ? `Configurado (${settings.whatsapp_access_token_hint})`
                : "EAA..."
            }
            className="h-10 rounded-lg border-outline-variant bg-card font-mono text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="whatsapp_verify_token"
            className="font-mono text-xs tracking-wider text-on-surface-variant uppercase"
          >
            Verify Token
          </Label>
          <Input
            id="whatsapp_verify_token"
            name="whatsapp_verify_token"
            type="password"
            autoComplete="off"
            placeholder={
              settings.whatsapp_verify_token_set
                ? `Configurado (${settings.whatsapp_verify_token_hint})`
                : "Token de verificación del webhook"
            }
            className="h-10 rounded-lg border-outline-variant bg-card font-mono text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="whatsapp_phone_number_id"
            className="font-mono text-xs tracking-wider text-on-surface-variant uppercase"
          >
            Phone Number ID
          </Label>
          <Input
            id="whatsapp_phone_number_id"
            name="whatsapp_phone_number_id"
            defaultValue={settings.whatsapp_phone_number_id ?? ""}
            className="h-10 rounded-lg border-outline-variant bg-card font-mono text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="whatsapp_business_account_id"
            className="font-mono text-xs tracking-wider text-on-surface-variant uppercase"
          >
            Business Account ID
          </Label>
          <Input
            id="whatsapp_business_account_id"
            name="whatsapp_business_account_id"
            defaultValue={settings.whatsapp_business_account_id ?? ""}
            className="h-10 rounded-lg border-outline-variant bg-card font-mono text-sm"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="font-mono text-xs tracking-wider text-on-surface-variant uppercase">
          URL del Webhook
        </Label>
        <Input
          readOnly
          value={webhookUrl}
          className="h-10 rounded-lg border-outline-variant bg-muted font-mono text-xs"
        />
        <p className="text-xs text-secondary">
          Configúrala en Meta Developer → WhatsApp → Configuration → Callback
          URL. El Verify Token debe coincidir con el de arriba.
        </p>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p role="status" className="text-sm text-primary">
          {state.message}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={pending}
        className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      >
        {pending ? "Guardando…" : "Guardar integraciones"}
      </Button>
    </form>
  );
}
