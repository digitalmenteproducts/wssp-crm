"use client";

import { useActionState, useState } from "react";

import {
  createSegmentAction,
  type SegmentFormState,
} from "@/app/(dashboard)/actions/sprint3";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: SegmentFormState = {};

type ConditionDraft = {
  field: string;
  op: string;
  value: string;
};

export function CreateManualSegmentForm() {
  const [open, setOpen] = useState(false);
  const [conditions, setConditions] = useState<ConditionDraft[]>([
    { field: "product", op: "contains", value: "" },
  ]);
  const [state, formAction, pending] = useActionState(
    createSegmentAction,
    initialState,
  );

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        className="h-9"
        onClick={() => setOpen(true)}
      >
        Crear segmento manual
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-xl border border-outline-variant/50 bg-card p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">Crear segmento manual</h3>
        <button
          type="button"
          className="text-xs text-secondary hover:text-primary"
          onClick={() => setOpen(false)}
        >
          Cerrar
        </button>
      </div>
      <p className="text-xs text-secondary">
        Opcional. Los segmentos de IA y predefinidos suelen bastar para campañas.
      </p>

      <input
        type="hidden"
        name="conditions_json"
        value={JSON.stringify(conditions)}
      />
      <input type="hidden" name="operator" value="and" />

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
      </div>

      <div className="space-y-3">
        <p className="font-mono text-xs tracking-wider text-secondary uppercase">
          Reglas (todas deben cumplirse)
        </p>
        {conditions.map((condition, index) => (
          <div
            key={index}
            className="grid gap-2 rounded-lg border border-outline-variant/40 p-3 md:grid-cols-3"
          >
            <select
              className="h-10 rounded-md border border-outline-variant bg-card px-3 text-sm"
              value={condition.field}
              onChange={(event) => {
                const next = [...conditions];
                next[index] = { ...next[index], field: event.target.value };
                setConditions(next);
              }}
            >
              <option value="product">Producto</option>
              <option value="contact_status">Estado del contacto</option>
              <option value="intent">Intención</option>
              <option value="reason">Motivo / objeción</option>
              <option value="segment">Etiqueta IA</option>
              <option value="tag">Etiqueta</option>
              <option value="last_message_within_days">Últimos N días</option>
            </select>
            <select
              className="h-10 rounded-md border border-outline-variant bg-card px-3 text-sm"
              value={condition.op}
              onChange={(event) => {
                const next = [...conditions];
                next[index] = { ...next[index], op: event.target.value };
                setConditions(next);
              }}
            >
              <option value="contains">Contiene</option>
              <option value="eq">Igual</option>
              <option value="lte">≤</option>
              <option value="gte">≥</option>
            </select>
            <Input
              value={condition.value}
              onChange={(event) => {
                const next = [...conditions];
                next[index] = { ...next[index], value: event.target.value };
                setConditions(next);
              }}
              placeholder="pizza | no_compro | 30"
              className="h-10"
              required
            />
          </div>
        ))}
        {conditions.length < 4 ? (
          <Button
            type="button"
            variant="outline"
            className="h-8 text-xs"
            onClick={() =>
              setConditions([
                ...conditions,
                { field: "contact_status", op: "eq", value: "" },
              ])
            }
          >
            Añadir regla
          </Button>
        ) : null}
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
        {pending ? "Creando…" : "Guardar segmento manual"}
      </Button>
    </form>
  );
}
