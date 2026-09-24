"use client";

import { useActionState, useState, useTransition } from "react";

import {
  cancelClinicAppointmentAction,
  getClinicAvailabilityAction,
  updateClinicAppointmentAction,
  type ClinicFormState,
} from "@/app/(dashboard)/actions/clinic";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { clinicErrorMessage } from "@/lib/clinic/errors";
import {
  formatAppointmentRange,
  formatSlotClock,
} from "@/lib/clinic/timezone-display";
import { cn } from "@/lib/utils";
import type { ClinicAppointmentListItem } from "@/types/clinic";

const initial: ClinicFormState = {};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "No asistió",
};

type SlotOption = { start_at: string; end_at: string };

type ClinicAppointmentCardProps = {
  appointment: ClinicAppointmentListItem;
  timezone: string;
};

export function ClinicAppointmentCard({
  appointment,
  timezone,
}: ClinicAppointmentCardProps) {
  const [openReschedule, setOpenReschedule] = useState(false);
  const [date, setDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<SlotOption | null>(null);
  const [slots, setSlots] = useState<SlotOption[]>([]);
  const [availabilityError, setAvailabilityError] = useState<string | null>(
    null,
  );
  const [hasWeeklyForDay, setHasWeeklyForDay] = useState(true);
  const [loadingSlots, startSlotsTransition] = useTransition();

  const [updateState, updateAction, updatePending] = useActionState(
    updateClinicAppointmentAction,
    initial,
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelClinicAppointmentAction,
    initial,
  );

  function loadSlots(nextDate: string) {
    setSelectedSlot(null);
    setSlots([]);
    setAvailabilityError(null);
    setHasWeeklyForDay(true);
    if (!nextDate) return;

    startSlotsTransition(async () => {
      const result = await getClinicAvailabilityAction({
        resource_id: appointment.resource_id,
        date: nextDate,
      });
      if (!result.ok) {
        setAvailabilityError(result.error);
        setHasWeeklyForDay(false);
        return;
      }
      setHasWeeklyForDay(result.hasWeeklyForDay);
      setSlots(result.slots);
      if (!result.hasWeeklyForDay) {
        setAvailabilityError(
          `${result.resourceName} no tiene disponibilidad configurada para este día.`,
        );
      } else if (result.slots.length === 0) {
        setAvailabilityError("No hay horarios libres en esta fecha.");
      } else {
        setAvailabilityError(null);
      }
    });
  }

  if (appointment.status === "cancelled") {
    return (
      <li className="rounded-xl border border-outline-variant/40 p-3 text-sm opacity-70">
        <p className="font-medium">
          {appointment.service_name || appointment.title} · Cancelada
        </p>
        <p className="text-xs text-secondary">
          {appointment.contact_name || "Paciente"} ({appointment.contact_phone}) ·{" "}
          {appointment.resource_name}
        </p>
        <p className="font-mono text-xs">
          {formatAppointmentRange(
            appointment.start_at,
            appointment.end_at,
            timezone,
          )}
        </p>
      </li>
    );
  }

  const feedback =
    updateState.error ||
    updateState.message ||
    cancelState.error ||
    cancelState.message;

  return (
    <li className="rounded-xl border border-outline-variant/40 p-3 text-sm">
      <p className="font-medium">
        {appointment.service_name || appointment.title} ·{" "}
        {STATUS_LABEL[appointment.status] ?? appointment.status}
      </p>
      <p className="text-xs text-secondary">
        {appointment.contact_name || "Paciente"} ({appointment.contact_phone}) ·{" "}
        {appointment.resource_name}
      </p>
      <p className="font-mono text-xs">
        {formatAppointmentRange(
          appointment.start_at,
          appointment.end_at,
          timezone,
        )}
      </p>

      {feedback ? (
        <div
          className={cn(
            "mt-2 rounded-lg border px-2 py-1.5 text-xs",
            updateState.error || cancelState.error
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-primary/30 bg-primary/10 text-primary",
          )}
          role="status"
        >
          {feedback}
        </div>
      ) : null}

      <div className="mt-2 space-y-2">
        <form action={updateAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="id" value={appointment.id} />
          <select
            name="status"
            defaultValue={appointment.status}
            className="h-8 rounded border border-outline-variant bg-card px-2 text-xs"
          >
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={updatePending}
          >
            Actualizar estado
          </Button>
        </form>

        <div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setOpenReschedule((v) => !v)}
          >
            {openReschedule ? "Cerrar reprogramación" : "Reprogramar"}
          </Button>
        </div>

        {openReschedule ? (
          <form
            action={updateAction}
            onSubmit={(e) => {
              if (!date || !selectedSlot) {
                e.preventDefault();
              }
            }}
            className="space-y-2 rounded-lg border border-outline-variant/40 p-3"
          >
            <input type="hidden" name="id" value={appointment.id} />
            <div className="space-y-1">
              <Label className="text-xs">Nueva fecha</Label>
              <input
                type="date"
                name="date"
                value={date}
                onChange={(e) => {
                  const value = e.target.value;
                  setDate(value);
                  loadSlots(value);
                }}
                required
                className="h-8 w-full rounded border border-outline-variant bg-card px-2 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Horario disponible</Label>
              {!date ? (
                <p className="text-xs text-secondary">Selecciona una fecha.</p>
              ) : loadingSlots ? (
                <p className="text-xs text-secondary">
                  Consultando disponibilidad…
                </p>
              ) : availabilityError ? (
                <p
                  className={cn(
                    "text-xs",
                    hasWeeklyForDay ? "text-secondary" : "text-destructive",
                  )}
                >
                  {availabilityError}
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {slots.map((slot) => {
                    const active = selectedSlot?.start_at === slot.start_at;
                    return (
                      <button
                        key={slot.start_at}
                        type="button"
                        onClick={() => setSelectedSlot(slot)}
                        className={cn(
                          "rounded border px-2 py-1 font-mono text-xs",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-outline-variant bg-card",
                        )}
                      >
                        {formatSlotClock(slot.start_at, timezone)}
                      </button>
                    );
                  })}
                </div>
              )}
              {!selectedSlot && date && !loadingSlots && !availabilityError ? (
                <p className="text-xs text-destructive">
                  {clinicErrorMessage("MISSING_SLOT")}
                </p>
              ) : null}
            </div>
            <input
              type="hidden"
              name="start_at"
              value={selectedSlot?.start_at ?? ""}
            />
            <input
              type="hidden"
              name="end_at"
              value={selectedSlot?.end_at ?? ""}
            />
            <Button
              type="submit"
              size="sm"
              disabled={updatePending || loadingSlots || !selectedSlot}
            >
              {updatePending ? "Guardando…" : "Confirmar reprogramación"}
            </Button>
          </form>
        ) : null}

        <form action={cancelAction}>
          <input type="hidden" name="id" value={appointment.id} />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={cancelPending}
          >
            {cancelPending ? "Cancelando…" : "Cancelar cita"}
          </Button>
        </form>
      </div>
    </li>
  );
}
