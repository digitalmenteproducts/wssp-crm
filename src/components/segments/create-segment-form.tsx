"use client";

import { useActionState } from "react";

import {
  createSegmentAction,
  type SegmentFormState,
} from "@/app/(dashboard)/actions/sprint3";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: SegmentFormState = {};

export function CreateSegmentForm() {
  const [state, formAction, pending] = useActionState(
    createSegmentAction,
    initialState,
  );

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-xl border border-outline-variant/50 bg-card p-5"
    >
      <h3 className="text-base font-semibold">Nuevo segmento</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="font-mono text-xs uppercase">
            Nombre
          </Label>
          <Input id="name" name="name" required className="h-10" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description" className="font-mono text-xs uppercase">
            Descripción
          </Label>
          <Input id="description" name="description" className="h-10" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="field" className="font-mono text-xs uppercase">
            Campo
          </Label>
          <select
            id="field"
            name="field"
            className="h-10 w-full rounded-md border border-outline-variant bg-card px-3 text-sm"
            defaultValue="product"
          >
            <option value="product">Producto</option>
            <option value="contact_status">Estado del contacto</option>
            <option value="reason">Motivo / objeción</option>
            <option value="intent">Intención</option>
            <option value="segment">Etiqueta IA</option>
            <option value="last_message_within_days">Últimos N días</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="op" className="font-mono text-xs uppercase">
            Operador
          </Label>
          <select
            id="op"
            name="op"
            className="h-10 w-full rounded-md border border-outline-variant bg-card px-3 text-sm"
            defaultValue="contains"
          >
            <option value="contains">Contiene</option>
            <option value="eq">Igual</option>
            <option value="lte">≤</option>
            <option value="gte">≥</option>
          </select>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="value" className="font-mono text-xs uppercase">
            Valor
          </Label>
          <Input
            id="value"
            name="value"
            required
            placeholder="pizza | no_compro | 15"
            className="h-10"
          />
        </div>
      </div>
      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      {state.message ? (
        <p className="text-sm text-primary">{state.message}</p>
      ) : null}
      <Button
        type="submit"
        disabled={pending}
        className="h-9 bg-primary text-primary-foreground hover:bg-primary-container"
      >
        {pending ? "Creando…" : "Crear segmento"}
      </Button>
    </form>
  );
}
