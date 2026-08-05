"use client";

import { useActionState } from "react";

import {
  createTemplateAction,
  type TemplateFormState,
} from "@/app/(dashboard)/actions/sprint5";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: TemplateFormState = {};

type CreateTemplateFormProps = {
  segments: Array<{ id: string; name: string }>;
};

export function CreateTemplateForm({ segments }: CreateTemplateFormProps) {
  const [state, formAction, pending] = useActionState(
    createTemplateAction,
    initialState,
  );

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-xl border border-outline-variant/50 bg-card p-5"
    >
      <h3 className="text-base font-semibold">Crear plantilla</h3>
      <p className="text-xs text-secondary">
        Borrador local. Usa variables Meta como {"{{1}}"} o {"{{name}}"}.
        Para enviar, sincroniza una plantilla aprobada y usa Nueva Campaña.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="font-mono text-xs uppercase">
            Nombre
          </Label>
          <Input
            id="name"
            name="name"
            required
            placeholder="bienvenida_cliente"
            className="h-10 font-mono text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="category" className="font-mono text-xs uppercase">
            Categoría
          </Label>
          <select
            id="category"
            name="category"
            defaultValue="UTILITY"
            className="h-10 w-full rounded-md border border-outline-variant bg-card px-3 text-sm"
          >
            <option value="UTILITY">Utility</option>
            <option value="MARKETING">Marketing</option>
            <option value="AUTHENTICATION">Authentication</option>
            <option value="Bienvenida">Bienvenida</option>
            <option value="Promocional">Promocional</option>
            <option value="Seguimiento">Seguimiento</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="language" className="font-mono text-xs uppercase">
            Idioma
          </Label>
          <Input
            id="language"
            name="language"
            defaultValue="es"
            className="h-10"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="segment_id" className="font-mono text-xs uppercase">
            Segmento (opcional)
          </Label>
          <select
            id="segment_id"
            name="segment_id"
            defaultValue=""
            className="h-10 w-full rounded-md border border-outline-variant bg-card px-3 text-sm"
          >
            <option value="">Sin segmento</option>
            {segments.map((segment) => (
              <option key={segment.id} value={segment.id}>
                {segment.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="content" className="font-mono text-xs uppercase">
            Contenido
          </Label>
          <textarea
            id="content"
            name="content"
            required
            rows={4}
            placeholder="Hola {{1}}, gracias por escribirnos…"
            className="w-full rounded-md border border-outline-variant bg-card px-3 py-2 text-sm"
          />
        </div>
      </div>

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
        disabled={pending}
        className="h-9 bg-primary text-primary-foreground hover:bg-primary-container"
      >
        {pending ? "Creando…" : "Crear plantilla"}
      </Button>
    </form>
  );
}
