"use client";

import { useActionState, useMemo, useState } from "react";

import {
  createClinicBlockAction,
  deleteClinicAvailabilityAction,
  deleteClinicBlockAction,
  upsertClinicAvailabilityAction,
  upsertClinicResourceAction,
  type ClinicFormState,
} from "@/app/(dashboard)/actions/clinic";
import { ClinicAppointmentCard } from "@/components/clinic/clinic-appointment-card";
import { ClinicAppointmentForm } from "@/components/clinic/clinic-appointment-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatInBusinessTimeZone,
  formatTimezoneLabel,
} from "@/lib/clinic/timezone-display";
import { zonedLocalToUtcIso } from "@/lib/clinic/datetime";
import type {
  ClinicAppointmentListItem,
  ClinicAvailability,
  ClinicCalendarResource,
  ClinicScheduleBlock,
  ClinicServiceListItem,
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

type ContactOption = { id: string; name: string | null; phone: string };

type ClinicAgendaWorkspaceProps = {
  resources: ClinicCalendarResource[];
  services: ClinicServiceListItem[];
  availability: ClinicAvailability[];
  blocks: ClinicScheduleBlock[];
  appointments: ClinicAppointmentListItem[];
  contacts: ContactOption[];
  timezone: string;
};

function FeedbackBanner({ state }: { state: ClinicFormState }) {
  if (!state.error && !state.message) return null;
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${
        state.error
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-primary/30 bg-primary/10 text-primary"
      }`}
      role={state.error ? "alert" : "status"}
    >
      {state.error ?? state.message}
    </div>
  );
}

export function ClinicAgendaWorkspace({
  resources,
  services,
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

  const [blockDate, setBlockDate] = useState("");
  const [blockStartTime, setBlockStartTime] = useState("09:00");
  const [blockEndTime, setBlockEndTime] = useState("10:00");

  const blockStartAt =
    blockDate && blockStartTime
      ? zonedLocalToUtcIso(blockDate, blockStartTime, timezone)
      : "";
  const blockEndAt =
    blockDate && blockEndTime
      ? zonedLocalToUtcIso(blockDate, blockEndTime, timezone)
      : "";

  const sortedAppointments = useMemo(
    () =>
      [...appointments].sort((a, b) => a.start_at.localeCompare(b.start_at)),
    [appointments],
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-secondary">
        Horarios de la clínica —{" "}
        <span className="font-medium text-on-surface">
          {formatTimezoneLabel(timezone)}
        </span>{" "}
        <span className="font-mono text-xs">({timezone})</span>
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

      {tab === "citas" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <ClinicAppointmentForm
            resources={resources}
            services={services}
            contacts={contacts}
            timezone={timezone}
          />
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">
              Citas ({sortedAppointments.length})
            </h3>
            {sortedAppointments.length === 0 ? (
              <p className="text-sm text-secondary">Aún no hay citas.</p>
            ) : (
              <ul className="space-y-3">
                {sortedAppointments.map((appt) => (
                  <ClinicAppointmentCard
                    key={appt.id}
                    appointment={appt}
                    timezone={timezone}
                  />
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
            <FeedbackBanner state={resourceState} />
            <div className="space-y-1">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                name="name"
                required
                placeholder="Dra. Luna Pastore"
              />
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
            <FeedbackBanner state={availabilityState} />
            <FeedbackBanner state={deleteAvailabilityState} />
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
                <Input
                  name="start_time"
                  type="time"
                  required
                  defaultValue="09:00"
                />
              </div>
              <div className="space-y-1">
                <Label>Fin</Label>
                <Input
                  name="end_time"
                  type="time"
                  required
                  defaultValue="13:00"
                />
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
            <FeedbackBanner state={blockState} />
            <FeedbackBanner state={deleteBlockState} />
            <p className="text-[11px] text-secondary">
              Horarios en zona de la clínica — {formatTimezoneLabel(timezone)}
            </p>
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
              <Label>Fecha</Label>
              <Input
                type="date"
                required
                value={blockDate}
                onChange={(e) => setBlockDate(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Inicio</Label>
                <Input
                  type="time"
                  required
                  value={blockStartTime}
                  onChange={(e) => setBlockStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Fin</Label>
                <Input
                  type="time"
                  required
                  value={blockEndTime}
                  onChange={(e) => setBlockEndTime(e.target.value)}
                />
              </div>
            </div>
            <input type="hidden" name="start_at" value={blockStartAt} />
            <input type="hidden" name="end_at" value={blockEndAt} />
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
                  {formatInBusinessTimeZone(b.start_at, timezone)} →{" "}
                  {formatInBusinessTimeZone(b.end_at, timezone)}
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
