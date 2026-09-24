"use client";

import { useActionState, useMemo, useState, useTransition } from "react";

import {
  createClinicAppointmentAction,
  getClinicAvailabilityAction,
  type ClinicFormState,
} from "@/app/(dashboard)/actions/clinic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clinicErrorMessage } from "@/lib/clinic/errors";
import {
  formatSlotClock,
  formatTimezoneLabel,
} from "@/lib/clinic/timezone-display";
import { cn } from "@/lib/utils";
import type { ClinicCalendarResource } from "@/types/clinic";

type ContactOption = { id: string; name: string | null; phone: string };

type SlotOption = { start_at: string; end_at: string };

const initial: ClinicFormState = {};

type ClinicAppointmentFormProps = {
  resources: ClinicCalendarResource[];
  contacts: ContactOption[];
  timezone: string;
};

function fieldClass(hasError: boolean) {
  return cn(
    "h-10 w-full rounded-lg border bg-card px-3 text-sm",
    hasError
      ? "border-destructive ring-2 ring-destructive/30"
      : "border-outline-variant",
  );
}

export function ClinicAppointmentForm({
  resources,
  contacts,
  timezone,
}: ClinicAppointmentFormProps) {
  const activeResources = useMemo(
    () => resources.filter((r) => r.active),
    [resources],
  );

  const [contactId, setContactId] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [date, setDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<SlotOption | null>(null);
  const [slots, setSlots] = useState<SlotOption[]>([]);
  const [hasWeeklyForDay, setHasWeeklyForDay] = useState(true);
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const [resourceName, setResourceName] = useState("");
  const [availabilityError, setAvailabilityError] = useState<string | null>(
    null,
  );
  const [clientError, setClientError] = useState<{
    field?: string;
    error: string;
  } | null>(null);
  const [loadingSlots, startSlotsTransition] = useTransition();

  const [state, formAction, pending] = useActionState(
    createClinicAppointmentAction,
    initial,
  );

  const errorField = clientError?.field ?? state.field;
  const errorMessage = clientError?.error ?? state.error;

  function loadSlots(nextResourceId: string, nextDate: string) {
    setSelectedSlot(null);
    setSlots([]);
    setAvailabilityError(null);
    setHasWeeklyForDay(true);

    if (!nextResourceId || !nextDate) return;

    startSlotsTransition(async () => {
      const result = await getClinicAvailabilityAction({
        resource_id: nextResourceId,
        date: nextDate,
      });
      if (!result.ok) {
        setSlots([]);
        setAvailabilityError(result.error);
        setHasWeeklyForDay(false);
        return;
      }
      setResourceName(result.resourceName);
      setDurationMinutes(result.durationMinutes);
      setHasWeeklyForDay(result.hasWeeklyForDay);
      setSlots(result.slots);
      if (!result.hasWeeklyForDay) {
        setAvailabilityError(
          `${result.resourceName} no tiene disponibilidad configurada para este día.`,
        );
      } else if (result.slots.length === 0) {
        setAvailabilityError(
          "No hay horarios libres para esta fecha. Todos los slots están ocupados o bloqueados.",
        );
      } else {
        setAvailabilityError(null);
      }
    });
  }

  const contactLabel =
    contacts.find((c) => c.id === contactId)?.name ||
    contacts.find((c) => c.id === contactId)?.phone ||
    "Paciente";
  const resourceLabel =
    activeResources.find((r) => r.id === resourceId)?.name ||
    resourceName ||
    "Profesional";

  function validateClient(): boolean {
    if (!contactId) {
      setClientError({
        field: "contact_id",
        error: clinicErrorMessage("MISSING_CONTACT"),
      });
      return false;
    }
    if (!resourceId) {
      setClientError({
        field: "resource_id",
        error: clinicErrorMessage("MISSING_RESOURCE"),
      });
      return false;
    }
    if (!serviceName.trim()) {
      setClientError({
        field: "service_name",
        error: clinicErrorMessage("MISSING_SERVICE"),
      });
      return false;
    }
    if (!date) {
      setClientError({
        field: "date",
        error: clinicErrorMessage("MISSING_DATE"),
      });
      return false;
    }
    if (!selectedSlot) {
      setClientError({
        field: "slot",
        error: clinicErrorMessage("MISSING_SLOT"),
      });
      return false;
    }
    setClientError(null);
    return true;
  }

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!validateClient()) {
          e.preventDefault();
        }
      }}
      className="space-y-3 rounded-xl border border-outline-variant/40 p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">Nueva cita</h3>
        <p className="text-right text-[11px] leading-snug text-secondary">
          Horarios de la clínica — {formatTimezoneLabel(timezone)}
        </p>
      </div>

      {errorMessage ? (
        <div
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}

      {state.message ? (
        <div
          className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary"
          role="status"
        >
          <p className="font-medium">{state.message}</p>
          {state.summary ? (
            <p className="mt-1 text-xs opacity-90">{state.summary}</p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-1">
        <Label htmlFor="contact_id">Paciente *</Label>
        <select
          id="contact_id"
          name="contact_id"
          value={contactId}
          onChange={(e) => setContactId(e.target.value)}
          className={fieldClass(errorField === "contact_id")}
        >
          <option value="">Seleccionar…</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {(c.name || "Sin nombre") + " · " + c.phone}
            </option>
          ))}
        </select>
        {errorField === "contact_id" && errorMessage ? (
          <p className="text-xs text-destructive">{errorMessage}</p>
        ) : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor="resource_id">Profesional *</Label>
        <select
          id="resource_id"
          name="resource_id"
          value={resourceId}
          onChange={(e) => {
            const value = e.target.value;
            setResourceId(value);
            loadSlots(value, date);
          }}
          className={fieldClass(errorField === "resource_id")}
        >
          <option value="">Seleccionar…</option>
          {activeResources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        {errorField === "resource_id" && errorMessage ? (
          <p className="text-xs text-destructive">{errorMessage}</p>
        ) : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor="service_name">Servicio / tratamiento *</Label>
        <Input
          id="service_name"
          name="service_name"
          value={serviceName}
          onChange={(e) => setServiceName(e.target.value)}
          className={fieldClass(errorField === "service_name")}
        />
        {errorField === "service_name" && errorMessage ? (
          <p className="text-xs text-destructive">{errorMessage}</p>
        ) : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor="appointment_date">Fecha *</Label>
        <Input
          id="appointment_date"
          name="date"
          type="date"
          value={date}
          onChange={(e) => {
            const value = e.target.value;
            setDate(value);
            loadSlots(resourceId, value);
          }}
          className={fieldClass(errorField === "date")}
        />
        {errorField === "date" && errorMessage ? (
          <p className="text-xs text-destructive">{errorMessage}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label>Horario disponible *</Label>
        {!resourceId || !date ? (
          <p className="text-xs text-secondary">
            Selecciona profesional y fecha para ver horarios.
          </p>
        ) : loadingSlots ? (
          <p className="text-xs text-secondary">Consultando disponibilidad…</p>
        ) : availabilityError ? (
          <div
            className={cn(
              "rounded-lg border px-3 py-2 text-sm",
              hasWeeklyForDay
                ? "border-outline-variant/50 text-secondary"
                : "border-destructive/40 bg-destructive/10 text-destructive",
            )}
            role="status"
          >
            {availabilityError}
          </div>
        ) : (
          <div
            className={cn(
              "flex flex-wrap gap-2 rounded-lg p-1",
              errorField === "slot" ? "ring-2 ring-destructive/30" : "",
            )}
          >
            {slots.map((slot) => {
              const active = selectedSlot?.start_at === slot.start_at;
              return (
                <button
                  key={slot.start_at}
                  type="button"
                  onClick={() => {
                    setSelectedSlot(slot);
                    setClientError(null);
                  }}
                  className={cn(
                    "rounded-md border px-3 py-1.5 font-mono text-sm transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-outline-variant bg-card hover:bg-muted",
                  )}
                >
                  {formatSlotClock(slot.start_at, timezone)}
                </button>
              );
            })}
          </div>
        )}
        {durationMinutes ? (
          <p className="text-xs text-secondary">
            Duración del turno: {durationMinutes} minutos
            {selectedSlot
              ? ` · Fin automático ${formatSlotClock(selectedSlot.end_at, timezone)}`
              : ""}
          </p>
        ) : null}
        {errorField === "slot" && errorMessage ? (
          <p className="text-xs text-destructive">{errorMessage}</p>
        ) : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor="administrative_notes">Notas administrativas</Label>
        <Input id="administrative_notes" name="administrative_notes" />
      </div>

      <input type="hidden" name="status" value="confirmed" />
      <input type="hidden" name="start_at" value={selectedSlot?.start_at ?? ""} />
      <input type="hidden" name="end_at" value={selectedSlot?.end_at ?? ""} />
      <input type="hidden" name="contact_label" value={contactLabel} />
      <input type="hidden" name="resource_label" value={resourceLabel} />

      <Button type="submit" disabled={pending || loadingSlots}>
        {pending ? "Creando cita…" : "Crear cita"}
      </Button>
    </form>
  );
}
