"use client";

import { useActionState } from "react";

import {
  launchCampaignAction,
  type CampaignFormState,
} from "@/app/(dashboard)/actions/sprint6";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: CampaignFormState = {};

type LaunchCampaignFormProps = {
  templates: Array<{ id: string; name: string; status: string; language: string }>;
  segments: Array<{ id: string; name: string; count: number }>;
};

export function LaunchCampaignForm({
  templates,
  segments,
}: LaunchCampaignFormProps) {
  const [state, formAction, pending] = useActionState(
    launchCampaignAction,
    initialState,
  );

  const approved = templates.filter((item) => item.status === "approved");

  return (
    <form
      action={formAction}
      className="mx-auto max-w-xl space-y-5 rounded-xl border border-outline-variant/50 bg-card p-6"
    >
      <div className="space-y-1.5">
        <Label htmlFor="name" className="font-mono text-xs uppercase">
          Nombre de la campaña
        </Label>
        <Input
          id="name"
          name="name"
          required
          placeholder="Recuperación pizza — agosto"
          className="h-10"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="segment_id" className="font-mono text-xs uppercase">
          Segmento
        </Label>
        <select
          id="segment_id"
          name="segment_id"
          required
          defaultValue=""
          className="h-10 w-full rounded-md border border-outline-variant bg-card px-3 text-sm"
        >
          <option value="" disabled>
            Elegir segmento
          </option>
          {segments.map((segment) => (
            <option key={segment.id} value={segment.id}>
              {segment.name} ({segment.count} contactos)
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="template_id" className="font-mono text-xs uppercase">
          Plantilla
        </Label>
        <select
          id="template_id"
          name="template_id"
          required
          defaultValue=""
          className="h-10 w-full rounded-md border border-outline-variant bg-card px-3 text-sm"
        >
          <option value="" disabled>
            Elegir plantilla aprobada
          </option>
          {approved.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name} · {template.language}
            </option>
          ))}
        </select>
        {approved.length === 0 ? (
          <p className="text-xs text-secondary">
            No hay plantillas aprobadas. Ve a Plantillas → Sincronizar Meta
            (p. ej. hello_world en el sandbox).
          </p>
        ) : null}
      </div>

      <label className="flex items-start gap-2 text-sm text-secondary">
        <input
          type="checkbox"
          name="confirm"
          value="on"
          className="mt-1"
          required
        />
        <span>
          Confirmo el envío a los contactos del segmento (máx. 50). En el
          sandbox de Meta solo llegan a números de prueba agregados.
        </span>
      </label>

      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p className="text-sm text-primary" role="status">
          {state.message}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={pending || approved.length === 0 || segments.length === 0}
        className="h-10 w-full bg-primary text-primary-foreground hover:bg-primary-container"
      >
        {pending ? "Enviando…" : "Enviar campaña"}
      </Button>
    </form>
  );
}
