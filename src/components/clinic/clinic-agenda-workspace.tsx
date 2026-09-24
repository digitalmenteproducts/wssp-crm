"use client";

import { useActionState, useMemo, useState } from "react";

import {
  cancelClinicAppointmentAction,
  createClinicAppointmentAction,
  createClinicBlockAction,
  deleteClinicAvailabilityAction,
  deleteClinicBlockAction,
  updateClinicAppointmentAction,
  upsertClinicAvailabilityAction,
  upsertClinicResourceAction,
  type ClinicFormState,
} from "@/app/(dashboard)/actions/clinic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  ClinicAppointmentListItem,
  ClinicAvailability,
  ClinicCalendarResource,
  ClinicScheduleBlock,
} from "@/types/clinic";

const initial: ClinicFormState = {};

const DAY_LABELS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "No asistió",
};

type ContactOption = { id: string; name: string | null; phone: string };

type ClinicAgendaWorkspaceProps = {
  resources: ClinicCalendarResource[];
  availability: ClinicAvailability[];
  blocks: ClinicScheduleBlock[];
  appointments: ClinicAppointmentListItem[];
  contacts: ContactOption[];
  timezone: string;
};

export function ClinicAgendaWorkspace({
  resources,
  availability,
  blocks,
  appointments,
  contacts,
  timezone,
}: ClinicAgendaWorkspaceProps) {
  const [tab, setTab] = useState<"citas" | "profesionales" | "horarios" | "bloqueos">(
    "citas",
  );

  const [resourceState, resourceAction, resourcePending] = useActionState(
    upsertClinicResourceAction,
    initial,
  );
  const [availabilityState, availabilityAction, availabilityPending] =
    useActionState(upsertClinicAvailabilityAction, initial);
  const [deleteAvailabilityState, deleteAvailabilityAction] = useActionState(
    deleteClinicAvailabilityAction,
    initial,
  );
  const [blockState, blockAction, blockPending] = useActionState(
    createClinicBlockAction,
    initial,
  );
  const [deleteBlockState, deleteBlockAction] = useActionState(
    deleteClinicBlockAction,
    initial,
  );
  const [appointmentState, appointmentAction, appointmentPending] =
    useActionState(createClinicAppointmentAction, initial);
  const [updateState, updateAction, updatePending] = useActionState(
    updateClinicAppointmentAction,
    initial,
  );
  const [cancelState, cancelAction] = useActionState(
    cancelClinicAppointmentAction,
    initial,
  );

  const activeResources = useMemo(
    () => resources.filter((r) => r.active),
    [resources],
  );

  const feedback =
    resourceState.error ||
    resourceState.message ||
    availabilityState.error ||
    availabilityState.message ||
    deleteAvailabilityState.error ||
    deleteAvailabilityState.message ||
    blockState.error ||
    blockState.message ||
    deleteBlockState.error ||
    deleteBlockState.message ||
    appointmentState.error ||
    appointmentState.message ||
    updateState.error ||
    updateState.message ||
    cancelState.error ||
    cancelState.message;

  return (
    <div className="space-y-6">
      <p className="text-xs text-secondary">
        Zona horaria del negocio:{" "}
        <span className="font-mono text-on-surface">{timezone}</span>
      </p>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["citas", "Citas"],
            ["profesionales", "Profesionales"],
            ["horarios", "Disponibilidad"],
            ["bloqueos", "Bloqueos"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              tab === key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-secondary hover:text-on-surface"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {feedback ? (
        <p
          className={`text-sm ${
            String(feedback).includes("No se") ||
            String(feedback).toLowerCase().includes("error") ||
            String(feedback).includes("conflicto") ||
            String(feedback).includes("disponible")
              ? "text-destructive"
              : "text-primary"
          }`}
          role="status"
        >
          {feedback}
        </p>
      ) : null}

      {tab === "citas" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <form
            action={appointmentAction}
            className="space-y-3 rounded-xl border border-outline-variant/40 p-4"
          >
            <h3 className="text-sm font-semibold">Nueva cita</h3>
            <div className="space-y-1">
              <Label htmlFor="contact_id">Paciente</Label>
              <select
                id="contact_id"
                name="contact_id"
                required
                className="h-10 w-full rounded-lg border border-outline-variant bg-card px-3 text-sm"
              >
                <option value="">Seleccionar…</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {(c.name || "Sin nombre") + " · " + c.phone}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="resource_id">Profesional</Label>
              <select
                id="resource_id"
                name="resource_id"
                required
                className="h-10 w-full rounded-lg border border-outline-variant bg-card px-3 text-sm"
              >
                <option value="">Seleccionar…</option>
                {activeResources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="service_name">Servicio / tratamiento</Label>
              <Input id="service_name" name="service_name" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="start_at_local">Inicio</Label>
                <Input
                  id="start_at_local"
                  type="datetime-local"
                  required
                  onChange={(e) => {
                    const hidden = e.currentTarget.form?.elements.namedItem(
                      "start_at",
                    ) as HTMLInputElement | null;
                    if (hidden && e.currentTarget.value) {
                      hidden.value = new Date(e.currentTarget.value).toISOString();
                    }
                  }}
                />
                <input type="hidden" name="start_at" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="end_at_local">Fin</Label>
                <Input
                  id="end_at_local"
                  type="datetime-local"
                  required
                  onChange={(e) => {
                    const hidden = e.currentTarget.form?.elements.namedItem(
                      "end_at",
                    ) as HTMLInputElement | null;
                    if (hidden && e.currentTarget.value) {
                      hidden.value = new Date(e.currentTarget.value).toISOString();
                    }
                  }}
                />
                <input type="hidden" name="end_at" required />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="administrative_notes">Notas administrativas</Label>
              <Input id="administrative_notes" name="administrative_notes" />
            </div>
            <input type="hidden" name="status" value="confirmed" />
            <Button type="submit" disabled={appointmentPending}>
              {appointmentPending ? "Creando…" : "Crear cita"}
            </Button>
            <p className="text-xs text-secondary">
              Tip: usa horarios locales del navegador; se guardan en UTC respetando
              la timezone del negocio al calcular disponibilidad.
            </p>
          </form>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">
              Citas ({appointments.length})
            </h3>
            {appointments.length === 0 ? (
              <p className="text-sm text-secondary">Aún no hay citas.</p>
            ) : (
              <ul className="space-y-3">
                {appointments.map((appt) => (
                  <li
                    key={appt.id}
                    className="rounded-xl border border-outline-variant/40 p-3 text-sm"
                  >
                    <p className="font-medium">
                      {appt.service_name || appt.title} ·{" "}
                      {STATUS_LABEL[appt.status] ?? appt.status}
                    </p>
                    <p className="text-xs text-secondary">
                      {appt.contact_name || "Paciente"} ({appt.contact_phone}) ·{" "}
                      {appt.resource_name}
                    </p>
                    <p className="font-mono text-xs">
                      {new Date(appt.start_at).toLocaleString("es")} →{" "}
                      {new Date(appt.end_at).toLocaleString("es")}
                    </p>
                    {appt.status !== "cancelled" ? (
                      <div className="mt-2 space-y-2">
                        <form action={updateAction} className="flex flex-wrap gap-2">
                          <input type="hidden" name="id" value={appt.id} />
                          <select
                            name="status"
                            defaultValue={appt.status}
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
                        <form
                          action={updateAction}
                          className="flex flex-wrap items-end gap-2"
                        >
                          <input type="hidden" name="id" value={appt.id} />
                          <div>
                            <Label className="text-xs">Reprogramar inicio</Label>
                            <Input
                              type="datetime-local"
                              className="h-8 text-xs"
                              required
                              onChange={(e) => {
                                const hidden = e.currentTarget.form?.elements.namedItem(
                                  "start_at",
                                ) as HTMLInputElement | null;
                                if (hidden && e.currentTarget.value) {
                                  hidden.value = new Date(
                                    e.currentTarget.value,
                                  ).toISOString();
                                }
                              }}
                            />
                            <input type="hidden" name="start_at" />
                          </div>
                          <div>
                            <Label className="text-xs">Fin</Label>
                            <Input
                              type="datetime-local"
                              className="h-8 text-xs"
                              required
                              onChange={(e) => {
                                const hidden = e.currentTarget.form?.elements.namedItem(
                                  "end_at",
                                ) as HTMLInputElement | null;
                                if (hidden && e.currentTarget.value) {
                                  hidden.value = new Date(
                                    e.currentTarget.value,
                                  ).toISOString();
                                }
                              }}
                            />
                            <input type="hidden" name="end_at" />
                          </div>
                          <Button
                            type="submit"
                            size="sm"
                            variant="outline"
                            disabled={updatePending}
                          >
                            Reprogramar
                          </Button>
                        </form>
                        <form action={cancelAction}>
                          <input type="hidden" name="id" value={appt.id} />
                          <Button type="submit" size="sm" variant="outline">
                            Cancelar
                          </Button>
                        </form>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {tab === "profesionales" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <form
            action={resourceAction}
            className="space-y-3 rounded-xl border border-outline-variant/40 p-4"
          >
            <h3 className="text-sm font-semibold">Nuevo profesional</h3>
            <div className="space-y-1">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" name="name" required placeholder="Dra. Luna Pastore" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked />
              Activo
            </label>
            <Button type="submit" disabled={resourcePending}>
              {resourcePending ? "Guardando…" : "Guardar"}
            </Button>
          </form>
          <ul className="space-y-2">
            {resources.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between rounded-lg border border-outline-variant/40 px-3 py-2 text-sm"
              >
                <span>
                  {r.name}{" "}
                  <span className="text-xs text-secondary">
                    {r.active ? "activo" : "inactivo"}
                  </span>
                </span>
                <form action={resourceAction} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="name" value={r.name} />
                  <input
                    type="hidden"
                    name="active"
                    value={r.active ? "false" : "true"}
                  />
                  <Button type="submit" size="sm" variant="outline">
                    {r.active ? "Desactivar" : "Activar"}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {tab === "horarios" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <form
            action={availabilityAction}
            className="space-y-3 rounded-xl border border-outline-variant/40 p-4"
          >
            <h3 className="text-sm font-semibold">Bloque semanal</h3>
            <div className="space-y-1">
              <Label>Profesional</Label>
              <select
                name="resource_id"
                required
                className="h-10 w-full rounded-lg border border-outline-variant bg-card px-3 text-sm"
              >
                {resources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Día</Label>
              <select
                name="day_of_week"
                className="h-10 w-full rounded-lg border border-outline-variant bg-card px-3 text-sm"
                defaultValue={1}
              >
                {DAY_LABELS.map((label, idx) => (
                  <option key={label} value={idx}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Inicio</Label>
                <Input name="start_time" type="time" required defaultValue="09:00" />
              </div>
              <div className="space-y-1">
                <Label>Fin</Label>
                <Input name="end_time" type="time" required defaultValue="13:00" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Duración de slot (min)</Label>
              <select
                name="slot_duration_minutes"
                defaultValue={30}
                className="h-10 w-full rounded-lg border border-outline-variant bg-card px-3 text-sm"
              >
                {[15, 20, 30, 45, 60, 90, 120].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={availabilityPending}>
              {availabilityPending ? "Guardando…" : "Añadir disponibilidad"}
            </Button>
          </form>
          <ul className="space-y-2">
            {availability.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between rounded-lg border border-outline-variant/40 px-3 py-2 text-sm"
              >
                <span>
                  {resources.find((r) => r.id === row.resource_id)?.name ?? "—"} ·{" "}
                  {DAY_LABELS[row.day_of_week]} {row.start_time.slice(0, 5)}–
                  {row.end_time.slice(0, 5)} ({row.slot_duration_minutes} min)
                </span>
                <form action={deleteAvailabilityAction}>
                  <input type="hidden" name="id" value={row.id} />
                  <Button type="submit" size="sm" variant="outline">
                    Eliminar
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {tab === "bloqueos" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <form
            action={blockAction}
            className="space-y-3 rounded-xl border border-outline-variant/40 p-4"
          >
            <h3 className="text-sm font-semibold">Nuevo bloqueo</h3>
            <div className="space-y-1">
              <Label>Profesional</Label>
              <select
                name="resource_id"
                required
                className="h-10 w-full rounded-lg border border-outline-variant bg-card px-3 text-sm"
              >
                {resources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Inicio</Label>
              <Input
                type="datetime-local"
                required
                onChange={(e) => {
                  const hidden = e.currentTarget.form?.elements.namedItem(
                    "start_at",
                  ) as HTMLInputElement | null;
                  if (hidden && e.currentTarget.value) {
                    hidden.value = new Date(e.currentTarget.value).toISOString();
                  }
                }}
              />
              <input type="hidden" name="start_at" />
            </div>
            <div className="space-y-1">
              <Label>Fin</Label>
              <Input
                type="datetime-local"
                required
                onChange={(e) => {
                  const hidden = e.currentTarget.form?.elements.namedItem(
                    "end_at",
                  ) as HTMLInputElement | null;
                  if (hidden && e.currentTarget.value) {
                    hidden.value = new Date(e.currentTarget.value).toISOString();
                  }
                }}
              />
              <input type="hidden" name="end_at" />
            </div>
            <div className="space-y-1">
              <Label>Motivo administrativo</Label>
              <Input name="reason" placeholder="Vacaciones, feriado, reunión…" />
            </div>
            <Button type="submit" disabled={blockPending}>
              {blockPending ? "Guardando…" : "Crear bloqueo"}
            </Button>
          </form>
          <ul className="space-y-2">
            {blocks.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between rounded-lg border border-outline-variant/40 px-3 py-2 text-sm"
              >
                <span>
                  {resources.find((r) => r.id === b.resource_id)?.name ?? "—"} ·{" "}
                  {new Date(b.start_at).toLocaleString("es")} →{" "}
                  {new Date(b.end_at).toLocaleString("es")}
                  {b.reason ? ` · ${b.reason}` : ""}
                </span>
                <form action={deleteBlockAction}>
                  <input type="hidden" name="id" value={b.id} />
                  <Button type="submit" size="sm" variant="outline">
                    Eliminar
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
