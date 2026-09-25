"use client";

import { useActionState, useMemo, useState } from "react";

import {
  upsertClinicServiceAction,
  type ClinicFormState,
} from "@/app/(dashboard)/actions/clinic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type {
  ClinicCalendarResource,
  ClinicServiceAvailability,
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

const DURATION_HINT = "Entre 5 y 240 minutos (ej. 30, 40, 60).";

type AvailabilityDraft = {
  day_of_week: number;
  start_time: string;
  end_time: string;
};

type ClinicServicesWorkspaceProps = {
  services: ClinicServiceListItem[];
  resources: ClinicCalendarResource[];
  availabilityByServiceId: Record<string, ClinicServiceAvailability[]>;
  canEdit: boolean;
};

function FeedbackBanner({ state }: { state: ClinicFormState }) {
  if (!state.error && !state.message) return null;
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2 text-sm",
        state.error
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-primary/30 bg-primary/10 text-primary",
      )}
      role={state.error ? "alert" : "status"}
    >
      {state.error ?? state.message}
    </div>
  );
}

function emptyDraft(): {
  id?: string;
  name: string;
  duration_minutes: number;
  requires_initial_consultation: boolean;
  initial_consultation_service_id: string;
  resource_ids: string[];
  active: boolean;
  use_specific_availability: boolean;
  availability: AvailabilityDraft[];
} {
  return {
    name: "",
    duration_minutes: 30,
    requires_initial_consultation: false,
    initial_consultation_service_id: "",
    resource_ids: [],
    active: true,
    use_specific_availability: false,
    availability: [],
  };
}

export function ClinicServicesWorkspace({
  services,
  resources,
  availabilityByServiceId,
  canEdit,
}: ClinicServicesWorkspaceProps) {
  const [state, formAction, pending] = useActionState(
    upsertClinicServiceAction,
    initial,
  );
  const [draft, setDraft] = useState(emptyDraft);

  const activeResources = useMemo(
    () => resources.filter((r) => r.active),
    [resources],
  );

  const otherServices = useMemo(
    () => services.filter((s) => s.id !== draft.id),
    [services, draft.id],
  );

  function startEdit(service: ClinicServiceListItem) {
    const rows = availabilityByServiceId[service.id] ?? [];
    setDraft({
      id: service.id,
      name: service.name,
      duration_minutes: service.duration_minutes,
      requires_initial_consultation: service.requires_initial_consultation,
      initial_consultation_service_id:
        service.initial_consultation_service_id ?? "",
      resource_ids: [...service.resource_ids],
      active: service.active,
      use_specific_availability: service.use_specific_availability,
      availability: rows.map((row) => ({
        day_of_week: row.day_of_week,
        start_time: row.start_time.slice(0, 5),
        end_time: row.end_time.slice(0, 5),
      })),
    });
  }

  function toggleResource(resourceId: string) {
    setDraft((prev) => {
      const has = prev.resource_ids.includes(resourceId);
      return {
        ...prev,
        resource_ids: has
          ? prev.resource_ids.filter((id) => id !== resourceId)
          : [...prev.resource_ids, resourceId],
      };
    });
  }

  function addAvailabilityRow() {
    setDraft((prev) => ({
      ...prev,
      availability: [
        ...prev.availability,
        { day_of_week: 1, start_time: "09:00", end_time: "13:00" },
      ],
    }));
  }

  function updateAvailabilityRow(
    index: number,
    patch: Partial<AvailabilityDraft>,
  ) {
    setDraft((prev) => ({
      ...prev,
      availability: prev.availability.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    }));
  }

  function removeAvailabilityRow(index: number) {
    setDraft((prev) => ({
      ...prev,
      availability: prev.availability.filter((_, i) => i !== index),
    }));
  }

  const availabilityJson =
    draft.use_specific_availability && draft.availability.length > 0
      ? JSON.stringify(
          draft.availability.map((row) => ({
            day_of_week: row.day_of_week,
            start_time: row.start_time,
            end_time: row.end_time,
            active: true,
          })),
        )
      : "";

  return (
    <div className="space-y-6">
      {!canEdit ? (
        <p className="text-sm text-secondary">
          Solo administradores pueden crear o editar servicios.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {canEdit ? (
          <form
            action={formAction}
            className="space-y-3 rounded-xl border border-outline-variant/40 p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                {draft.id ? "Editar servicio" : "Nuevo servicio"}
              </h3>
              {draft.id ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setDraft(emptyDraft())}
                >
                  Cancelar edición
                </Button>
              ) : null}
            </div>
            <FeedbackBanner state={state} />
            {draft.id ? <input type="hidden" name="id" value={draft.id} /> : null}
            <input type="hidden" name="availability_json" value={availabilityJson} />
            {!draft.active ? (
              <input type="hidden" name="active" value="false" />
            ) : null}
            {!draft.use_specific_availability ? (
              <input type="hidden" name="use_specific_availability" value="false" />
            ) : null}
            {!draft.requires_initial_consultation ? (
              <input
                type="hidden"
                name="requires_initial_consultation"
                value="false"
              />
            ) : null}

            <div className="space-y-1">
              <Label htmlFor="service_name">Nombre *</Label>
              <Input
                id="service_name"
                name="name"
                required
                value={draft.name}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="duration_minutes">Duración (min) *</Label>
              <Input
                id="duration_minutes"
                name="duration_minutes"
                type="number"
                required
                min={5}
                max={240}
                step={1}
                value={draft.duration_minutes}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    duration_minutes: Number(e.target.value),
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">{DURATION_HINT}</p>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="requires_initial_consultation"
                checked={draft.requires_initial_consultation}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    requires_initial_consultation: e.target.checked,
                  }))
                }
              />
              Requiere consulta inicial
            </label>

            {draft.requires_initial_consultation ? (
              <div className="space-y-1">
                <Label htmlFor="initial_consultation_service_id">
                  Servicio de consulta inicial
                </Label>
                <select
                  id="initial_consultation_service_id"
                  name="initial_consultation_service_id"
                  value={draft.initial_consultation_service_id}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      initial_consultation_service_id: e.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-lg border border-outline-variant bg-card px-3 text-sm"
                >
                  <option value="">Seleccionar…</option>
                  {otherServices.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Profesionales</Label>
              {activeResources.length === 0 ? (
                <p className="text-xs text-secondary">
                  Crea profesionales en Agenda primero.
                </p>
              ) : (
                <ul className="space-y-1 rounded-lg border border-outline-variant/40 p-2">
                  {activeResources.map((r) => (
                    <li key={r.id}>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="resource_ids"
                          value={r.id}
                          checked={draft.resource_ids.includes(r.id)}
                          onChange={() => toggleResource(r.id)}
                        />
                        {r.name}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="active"
                checked={draft.active}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, active: e.target.checked }))
                }
              />
              Activo
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="use_specific_availability"
                checked={draft.use_specific_availability}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    use_specific_availability: e.target.checked,
                  }))
                }
              />
              Disponibilidad específica del servicio
            </label>

            {draft.use_specific_availability ? (
              <div className="space-y-2 rounded-lg border border-outline-variant/30 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-secondary">
                    Ventanas semanales (se intersectan con horario del profesional)
                  </p>
                  <Button type="button" size="sm" variant="outline" onClick={addAvailabilityRow}>
                    Añadir bloque
                  </Button>
                </div>
                {draft.availability.length === 0 ? (
                  <p className="text-xs text-secondary">
                    Sin bloques: se usará solo la disponibilidad del profesional.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {draft.availability.map((row, index) => (
                      <li
                        key={`${index}-${row.day_of_week}`}
                        className="grid grid-cols-[1fr_auto_auto_auto] items-end gap-2"
                      >
                        <div className="space-y-1">
                          <Label className="text-xs">Día</Label>
                          <select
                            value={row.day_of_week}
                            onChange={(e) =>
                              updateAvailabilityRow(index, {
                                day_of_week: Number(e.target.value),
                              })
                            }
                            className="h-9 w-full rounded-lg border border-outline-variant bg-card px-2 text-sm"
                          >
                            {DAY_LABELS.map((label, idx) => (
                              <option key={label} value={idx}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Inicio</Label>
                          <Input
                            type="time"
                            value={row.start_time}
                            onChange={(e) =>
                              updateAvailabilityRow(index, {
                                start_time: e.target.value,
                              })
                            }
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Fin</Label>
                          <Input
                            type="time"
                            value={row.end_time}
                            onChange={(e) =>
                              updateAvailabilityRow(index, {
                                end_time: e.target.value,
                              })
                            }
                            className="h-9"
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => removeAvailabilityRow(index)}
                        >
                          Quitar
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : draft.id ? "Actualizar servicio" : "Crear servicio"}
            </Button>
          </form>
        ) : (
          <div className="rounded-xl border border-outline-variant/40 p-4 text-sm text-secondary">
            Vista de solo lectura.
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-outline-variant/40">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b border-outline-variant/40 bg-muted/40 text-xs uppercase tracking-wide text-secondary">
              <tr>
                <th className="px-3 py-2 font-medium">Nombre</th>
                <th className="px-3 py-2 font-medium">Duración</th>
                <th className="px-3 py-2 font-medium">Profesionales</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                {canEdit ? (
                  <th className="px-3 py-2 font-medium">Editar</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {services.length === 0 ? (
                <tr>
                  <td
                    colSpan={canEdit ? 5 : 4}
                    className="px-3 py-6 text-center text-secondary"
                  >
                    Aún no hay servicios configurados.
                  </td>
                </tr>
              ) : (
                services.map((service) => (
                  <tr
                    key={service.id}
                    className="border-b border-outline-variant/20 last:border-0"
                  >
                    <td className="px-3 py-2 font-medium">{service.name}</td>
                    <td className="px-3 py-2">{service.duration_minutes} min</td>
                    <td className="px-3 py-2 text-secondary">
                      {service.resource_names.length > 0
                        ? service.resource_names.join(", ")
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "text-xs",
                          service.active ? "text-primary" : "text-secondary",
                        )}
                      >
                        {service.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    {canEdit ? (
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => startEdit(service)}
                        >
                          Editar
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
