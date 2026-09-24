import { hasClinicAgenda } from "@/lib/industry";
import * as clinicRepository from "@/repositories/clinic.repository";
import * as businessService from "@/services/business/business.service";
import {
  createClinicAppointmentSchema,
  createClinicBlockSchema,
  getAvailabilitySchema,
  updateClinicAppointmentSchema,
  upsertClinicAvailabilitySchema,
  upsertClinicResourceSchema,
  type CreateClinicAppointmentInput,
  type CreateClinicBlockInput,
  type GetAvailabilityFormInput,
  type UpdateClinicAppointmentInput,
  type UpsertClinicAvailabilityInput,
  type UpsertClinicResourceInput,
} from "@/schemas/clinic";
import {
  internalCalendarProvider,
  isSlotFree,
  zonedLocalToUtcIso,
} from "@/services/clinic/internal-calendar.provider";
import type {
  AvailabilitySlot,
  ClinicAppointment,
  ClinicAppointmentListItem,
  ClinicAvailability,
  ClinicCalendarResource,
  ClinicScheduleBlock,
} from "@/types/clinic";

export type ClinicActionResult<T = undefined> =
  | ({ ok: true; message?: string } & (T extends undefined
      ? { data?: undefined }
      : { data: T }))
  | { ok: false; error: string };

function formatZodIssues(error: { issues: { message: string }[] }): string {
  return error.issues.map((issue) => issue.message).join(" ");
}

async function requireClinicAdminWorkspace() {
  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return {
      ok: false as const,
      error: workspace.ok ? "Sin empresa." : workspace.error,
    };
  }
  if (!hasClinicAgenda(workspace.workspace.business.industry)) {
    return {
      ok: false as const,
      error: "La agenda clínica no está disponible para este negocio.",
    };
  }
  const role = workspace.workspace.membership.role;
  if (role !== "owner" && role !== "admin") {
    return { ok: false as const, error: "Sin permiso de administración." };
  }
  return { ok: true as const, workspace: workspace.workspace };
}

async function requireClinicMemberWorkspace() {
  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return {
      ok: false as const,
      error: workspace.ok ? "Sin empresa." : workspace.error,
    };
  }
  if (!hasClinicAgenda(workspace.workspace.business.industry)) {
    return {
      ok: false as const,
      error: "La agenda clínica no está disponible para este negocio.",
    };
  }
  return { ok: true as const, workspace: workspace.workspace };
}

export async function getAgendaPageData(): Promise<
  ClinicActionResult<{
    resources: ClinicCalendarResource[];
    availability: ClinicAvailability[];
    blocks: ClinicScheduleBlock[];
    appointments: ClinicAppointmentListItem[];
    timezone: string;
    businessName: string;
  }>
> {
  const gate = await requireClinicMemberWorkspace();
  if (!gate.ok) return gate;

  const businessId = gate.workspace.business.id;
  const [resources, availability, blocks, appointments] = await Promise.all([
    clinicRepository.listResources(businessId),
    clinicRepository.listAvailability(businessId),
    clinicRepository.listBlocks(businessId),
    clinicRepository.listAppointments(businessId),
  ]);

  if (resources.error) return { ok: false, error: resources.error.message };
  if (availability.error) return { ok: false, error: availability.error.message };
  if (blocks.error) return { ok: false, error: blocks.error.message };
  if (appointments.error) return { ok: false, error: appointments.error.message };

  return {
    ok: true,
    data: {
      resources: resources.data ?? [],
      availability: availability.data ?? [],
      blocks: blocks.data ?? [],
      appointments: appointments.data ?? [],
      timezone: gate.workspace.business.timezone,
      businessName: gate.workspace.business.name,
    },
  };
}

export async function upsertResource(
  input: UpsertClinicResourceInput,
): Promise<ClinicActionResult<ClinicCalendarResource>> {
  const parsed = upsertClinicResourceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssues(parsed.error) };
  const gate = await requireClinicAdminWorkspace();
  if (!gate.ok) return gate;

  const { data, error } = await clinicRepository.upsertResource(
    gate.workspace.business.id,
    parsed.data,
  );
  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo guardar el profesional." };
  }
  return { ok: true, data, message: "Profesional guardado." };
}

export async function upsertAvailability(
  input: UpsertClinicAvailabilityInput,
): Promise<ClinicActionResult<ClinicAvailability>> {
  const parsed = upsertClinicAvailabilitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssues(parsed.error) };
  const gate = await requireClinicAdminWorkspace();
  if (!gate.ok) return gate;

  const start = parsed.data.start_time.slice(0, 5);
  const end = parsed.data.end_time.slice(0, 5);
  if (end <= start) {
    return { ok: false, error: "La hora de fin debe ser posterior al inicio." };
  }

  const resource = await clinicRepository.getResource(
    gate.workspace.business.id,
    parsed.data.resource_id,
  );
  if (resource.error || !resource.data) {
    return { ok: false, error: "Profesional no encontrado." };
  }

  const { data, error } = await clinicRepository.upsertAvailability(
    gate.workspace.business.id,
    parsed.data,
  );
  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "No se pudo guardar la disponibilidad.",
    };
  }
  return { ok: true, data, message: "Disponibilidad guardada." };
}

export async function deleteAvailability(
  id: string,
): Promise<ClinicActionResult> {
  const gate = await requireClinicAdminWorkspace();
  if (!gate.ok) return gate;
  const { error } = await clinicRepository.deleteAvailability(
    gate.workspace.business.id,
    id,
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Bloque de disponibilidad eliminado." };
}

export async function createBlock(
  input: CreateClinicBlockInput,
): Promise<ClinicActionResult<ClinicScheduleBlock>> {
  const parsed = createClinicBlockSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssues(parsed.error) };
  const gate = await requireClinicAdminWorkspace();
  if (!gate.ok) return gate;

  if (new Date(parsed.data.end_at) <= new Date(parsed.data.start_at)) {
    return { ok: false, error: "El fin del bloqueo debe ser posterior al inicio." };
  }

  const { data, error } = await clinicRepository.createBlock(
    gate.workspace.business.id,
    parsed.data,
  );
  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo crear el bloqueo." };
  }
  return { ok: true, data, message: "Bloqueo creado." };
}

export async function deleteBlock(id: string): Promise<ClinicActionResult> {
  const gate = await requireClinicAdminWorkspace();
  if (!gate.ok) return gate;
  const { error } = await clinicRepository.deleteBlock(
    gate.workspace.business.id,
    id,
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Bloqueo eliminado." };
}

/**
 * AppointmentService facade — usado por UI hoy; listo para tools del Agente IA mañana.
 * No consulta tablas desde el agente directamente.
 */
export async function getAvailability(
  input: GetAvailabilityFormInput,
): Promise<ClinicActionResult<AvailabilitySlot[]>> {
  const parsed = getAvailabilitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssues(parsed.error) };
  const gate = await requireClinicMemberWorkspace();
  if (!gate.ok) return gate;

  const businessId = gate.workspace.business.id;
  const timezone = gate.workspace.business.timezone;

  const resource = await clinicRepository.getResource(
    businessId,
    parsed.data.resource_id,
  );
  if (resource.error || !resource.data) {
    return { ok: false, error: "Profesional no encontrado." };
  }
  if (!resource.data.active) {
    return { ok: false, error: "El profesional está inactivo." };
  }

  const dayStart = zonedLocalToUtcIso(parsed.data.date, "00:00", timezone);
  const dayEnd = zonedLocalToUtcIso(parsed.data.date, "23:59", timezone);

  const [weekly, appointments, blocks] = await Promise.all([
    clinicRepository.listAvailability(businessId, parsed.data.resource_id),
    clinicRepository.listActiveAppointmentsInRange(
      businessId,
      parsed.data.resource_id,
      dayStart,
      new Date(new Date(dayEnd).getTime() + 60_000).toISOString(),
    ),
    clinicRepository.listBlocks(businessId, {
      resourceId: parsed.data.resource_id,
      from: dayStart,
      to: new Date(new Date(dayEnd).getTime() + 60_000).toISOString(),
    }),
  ]);

  if (weekly.error) return { ok: false, error: weekly.error.message };
  if (appointments.error) return { ok: false, error: appointments.error.message };
  if (blocks.error) return { ok: false, error: blocks.error.message };

  const slots = internalCalendarProvider.getAvailability({
    businessId,
    resourceId: parsed.data.resource_id,
    date: parsed.data.date,
    timezone,
    durationMinutes: parsed.data.duration_minutes,
    weekly: weekly.data ?? [],
    appointments: appointments.data ?? [],
    blocks: blocks.data ?? [],
  });

  return { ok: true, data: slots };
}

export async function createAppointment(
  input: CreateClinicAppointmentInput,
): Promise<ClinicActionResult<ClinicAppointment>> {
  const parsed = createClinicAppointmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssues(parsed.error) };
  const gate = await requireClinicAdminWorkspace();
  if (!gate.ok) return gate;

  const businessId = gate.workspace.business.id;
  const timezone = gate.workspace.business.timezone;

  if (new Date(parsed.data.end_at) <= new Date(parsed.data.start_at)) {
    return { ok: false, error: "La hora de fin debe ser posterior al inicio." };
  }

  const resource = await clinicRepository.getResource(
    businessId,
    parsed.data.resource_id,
  );
  if (resource.error || !resource.data) {
    return { ok: false, error: "Profesional no encontrado." };
  }
  if (!resource.data.active) {
    return { ok: false, error: "No se pueden crear citas para un profesional inactivo." };
  }

  const rangeFrom = new Date(
    new Date(parsed.data.start_at).getTime() - 12 * 3600_000,
  ).toISOString();
  const rangeTo = new Date(
    new Date(parsed.data.end_at).getTime() + 12 * 3600_000,
  ).toISOString();

  const [appointments, blocks] = await Promise.all([
    clinicRepository.listActiveAppointmentsInRange(
      businessId,
      parsed.data.resource_id,
      rangeFrom,
      rangeTo,
    ),
    clinicRepository.listBlocks(businessId, {
      resourceId: parsed.data.resource_id,
      from: rangeFrom,
      to: rangeTo,
    }),
  ]);
  if (appointments.error) return { ok: false, error: appointments.error.message };
  if (blocks.error) return { ok: false, error: blocks.error.message };

  const free = isSlotFree({
    startAt: parsed.data.start_at,
    endAt: parsed.data.end_at,
    appointments: appointments.data ?? [],
    blocks: blocks.data ?? [],
  });
  if (!free) {
    return {
      ok: false,
      error: "Ese horario ya no está disponible. Elige otro slot.",
    };
  }

  const title =
    parsed.data.title?.trim() ||
    parsed.data.service_name.trim() ||
    "Cita";

  const { data, error } = await clinicRepository.insertAppointment(businessId, {
    contact_id: parsed.data.contact_id,
    resource_id: parsed.data.resource_id,
    title,
    service_name: parsed.data.service_name.trim(),
    start_at: parsed.data.start_at,
    end_at: parsed.data.end_at,
    status: parsed.data.status,
    source: "manual",
    administrative_notes: parsed.data.administrative_notes ?? "",
  });

  if (error || !data) {
    const msg = error?.message ?? "No se pudo crear la cita.";
    if (/clinic_appointments_no_overlap|exclusion|overlap/i.test(msg)) {
      return {
        ok: false,
        error: "Conflicto de agenda: el horario fue reservado por otra solicitud.",
      };
    }
    return { ok: false, error: msg };
  }

  void timezone;
  return { ok: true, data, message: "Cita creada." };
}

export async function rescheduleAppointment(
  input: UpdateClinicAppointmentInput,
): Promise<ClinicActionResult<ClinicAppointment>> {
  const parsed = updateClinicAppointmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: formatZodIssues(parsed.error) };
  const gate = await requireClinicAdminWorkspace();
  if (!gate.ok) return gate;

  const businessId = gate.workspace.business.id;
  const existing = await clinicRepository.getAppointment(
    businessId,
    parsed.data.id,
  );
  if (existing.error || !existing.data) {
    return { ok: false, error: "Cita no encontrada." };
  }

  const nextStart = parsed.data.start_at ?? existing.data.start_at;
  const nextEnd = parsed.data.end_at ?? existing.data.end_at;
  const nextResource = parsed.data.resource_id ?? existing.data.resource_id;

  if (new Date(nextEnd) <= new Date(nextStart)) {
    return { ok: false, error: "La hora de fin debe ser posterior al inicio." };
  }

  if (parsed.data.status !== "cancelled") {
    const rangeFrom = new Date(
      new Date(nextStart).getTime() - 12 * 3600_000,
    ).toISOString();
    const rangeTo = new Date(
      new Date(nextEnd).getTime() + 12 * 3600_000,
    ).toISOString();
    const [appointments, blocks] = await Promise.all([
      clinicRepository.listActiveAppointmentsInRange(
        businessId,
        nextResource,
        rangeFrom,
        rangeTo,
      ),
      clinicRepository.listBlocks(businessId, {
        resourceId: nextResource,
        from: rangeFrom,
        to: rangeTo,
      }),
    ]);
    if (appointments.error) {
      return { ok: false, error: appointments.error.message };
    }
    if (blocks.error) return { ok: false, error: blocks.error.message };

    const free = isSlotFree({
      startAt: nextStart,
      endAt: nextEnd,
      appointments: appointments.data ?? [],
      blocks: blocks.data ?? [],
      ignoreAppointmentId: existing.data.id,
    });
    if (!free) {
      return { ok: false, error: "El nuevo horario no está disponible." };
    }
  }

  const { data, error } = await clinicRepository.updateAppointment(
    businessId,
    parsed.data.id,
    {
      contact_id: parsed.data.contact_id,
      resource_id: parsed.data.resource_id,
      title: parsed.data.title,
      service_name: parsed.data.service_name,
      start_at: parsed.data.start_at,
      end_at: parsed.data.end_at,
      status: parsed.data.status,
      administrative_notes: parsed.data.administrative_notes,
    },
  );

  if (error || !data) {
    const msg = error?.message ?? "No se pudo actualizar la cita.";
    if (/clinic_appointments_no_overlap|exclusion|overlap/i.test(msg)) {
      return {
        ok: false,
        error: "Conflicto de agenda al reprogramar. Elige otro horario.",
      };
    }
    return { ok: false, error: msg };
  }

  return { ok: true, data, message: "Cita actualizada." };
}

export async function cancelAppointment(
  appointmentId: string,
): Promise<ClinicActionResult<ClinicAppointment>> {
  return rescheduleAppointment({
    id: appointmentId,
    status: "cancelled",
  });
}

export async function getAppointment(
  appointmentId: string,
): Promise<ClinicActionResult<ClinicAppointment>> {
  const gate = await requireClinicMemberWorkspace();
  if (!gate.ok) return gate;
  const { data, error } = await clinicRepository.getAppointment(
    gate.workspace.business.id,
    appointmentId,
  );
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Cita no encontrada." };
  }
  return { ok: true, data };
}
