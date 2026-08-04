"use client";

import { useActionState } from "react";

import {
  updateAiAction,
  type SettingsFormState,
} from "@/app/(dashboard)/configuracion/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { BusinessSettingsPublic } from "@/types/business";

const initialState: SettingsFormState = {};

type AiSettingsFormProps = {
  settings: BusinessSettingsPublic;
};

export function AiSettingsForm({ settings }: AiSettingsFormProps) {
  const [state, formAction, pending] = useActionState(
    updateAiAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-outline-variant/40 bg-muted/40 px-4 py-3">
        <div>
          <p className="font-mono text-xs tracking-wider text-on-surface-variant uppercase">
            Estado del motor
          </p>
          <p className="text-sm text-secondary">
            Activa o pausa la clasificación automática.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            name="ai_engine_enabled"
            defaultChecked={settings.ai_engine_enabled}
            className="size-4 rounded border-outline-variant accent-primary"
          />
          <span className="text-sm font-medium">ON</span>
        </label>
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor="classification_prompt"
          className="font-mono text-xs tracking-wider text-on-surface-variant uppercase"
        >
          Prompt de clasificación
        </Label>
        <textarea
          id="classification_prompt"
          name="classification_prompt"
          required
          rows={8}
          defaultValue={settings.classification_prompt ?? ""}
          className="w-full rounded-lg border border-outline-variant bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
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
        {pending ? "Guardando…" : "Guardar motor de IA"}
      </Button>
    </form>
  );
}
