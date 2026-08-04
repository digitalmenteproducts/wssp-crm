"use client";

import { useActionState } from "react";

import {
  updateGeneralAction,
  type SettingsFormState,
} from "@/app/(dashboard)/configuracion/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Business } from "@/types/business";

const initialState: SettingsFormState = {};

const TIMEZONES = [
  { value: "America/Caracas", label: "(UTC-04:00) Caracas" },
  { value: "America/Bogota", label: "(UTC-05:00) Bogotá" },
  { value: "America/Mexico_City", label: "(UTC-06:00) Ciudad de México" },
  { value: "America/New_York", label: "(UTC-05:00) Eastern Time" },
  { value: "America/Los_Angeles", label: "(UTC-08:00) Pacific Time" },
  { value: "UTC", label: "(UTC+00:00) Coordinated Universal Time" },
] as const;

type GeneralSettingsFormProps = {
  business: Business;
};

export function GeneralSettingsForm({ business }: GeneralSettingsFormProps) {
  const [state, formAction, pending] = useActionState(
    updateGeneralAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label
            htmlFor="name"
            className="font-mono text-xs tracking-wider text-on-surface-variant uppercase"
          >
            Nombre de la empresa
          </Label>
          <Input
            id="name"
            name="name"
            required
            defaultValue={business.name}
            className="h-10 rounded-lg border-outline-variant bg-card"
          />
        </div>
        <div className="space-y-1.5">
          <Label
            htmlFor="support_email"
            className="font-mono text-xs tracking-wider text-on-surface-variant uppercase"
          >
            Email de soporte
          </Label>
          <Input
            id="support_email"
            name="support_email"
            type="email"
            defaultValue={business.support_email ?? ""}
            placeholder="soporte@tuempresa.com"
            className="h-10 rounded-lg border-outline-variant bg-card"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor="timezone"
          className="font-mono text-xs tracking-wider text-on-surface-variant uppercase"
        >
          Zona horaria
        </Label>
        <select
          id="timezone"
          name="timezone"
          defaultValue={business.timezone}
          className="h-10 w-full rounded-lg border border-outline-variant bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz.value} value={tz.value}>
              {tz.label}
            </option>
          ))}
        </select>
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
        {pending ? "Guardando…" : "Guardar cambios"}
      </Button>
    </form>
  );
}
