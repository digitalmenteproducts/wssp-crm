import { hasClinicAgenda } from "@/lib/industry";
import {
  clinicErrorMessage,
  mapTechnicalError,
  type ClinicErrorCode,
} from "@/lib/clinic/errors";
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
  getWeekdayInTimeZone,
  internalCalendarProvider,
  zonedLocalToUtcIso,
} from "@/services/clinic/internal-calendar.provider";
import { utcIsoToDateYmd } from "@/lib/clinic/datetime";
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
  | {
      ok: false;
      error: string;
      code?: ClinicErrorCode;
      field?: string;
    };

export type AvailabilityQueryData = {
  slots: AvailabilitySlot[];
  hasWeeklyForDay: boolean;
  resourceName: string;
  resourceActive: boolean;
  durationMinutes: number | null;
};

function formatZodIssues(error: { issues: { message: string }[] }): string {
  return error.issues.map((issue) => issue.message).join(" ");
}

function fail(
  code: ClinicErrorCode,
  field?: string,
  override?: string,
): ClinicActionResult<never> {
  return {
    ok: false,
    code,
    field,
    error: override ?? clinicErrorMessage(code),
  };
}

async function requireClinicAdminWorkspace() {
  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return {
      ok: false as const,
      error: workspace.ok ? "Sin empresa." : workspace.error,
      code: "GENERIC" as const,
    };
  }
  if (!hasClinicAgenda(workspace.workspace.business.industry)) {
    return {
      ok: false as const,
      error: "La agenda clínica no está disponible para este negocio.",
      code: "GENERIC" as const,
    };
  }
  const role = workspace.workspace.membership.role;
  if (role !== "owner" && role !== "admin") {
    return {
      ok: false as const,
      error: "Sin permiso de administración.",
      code: "GENERIC" as const,
    };
  }
  return { ok: true as const, workspace: workspace.workspace };
}

async function requireClinicMemberWorkspace() {
  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return {
      ok: false as const,
      error: workspace.ok ? "Sin empresa." : workspace.error,
      code: "GENERIC" as const,
    };
  }
  if (!hasClinicAgenda(workspace.workspace.business.industry)) {
    return {
      ok: false as const,
      error: "La agenda clínica no está disponible para este negocio.",
      code: "GENERIC" as const,
    };
  }
  return { ok: true as const, workspace: workspace.workspace };
}

function classifyBusyConflict(input: {
  startAt: string;
  endAt: string;
  appointments: Array<
    Pick<ClinicAppointment, "id" | "start_at" | "end_at" | "status">
  >;
  blocks: Array<Pick<ClinicScheduleBlock, "start_at" | "end_at">>;
  ignoreAppointmentId?: string;
}): ClinicErrorCode | null {
  const start = new Date(input.startAt).getTime();
  const end = new Date(input.endAt).getTime();
  if (!(end > start)) return "INVALID_TIME_ORDER";

  for (const block of input.blocks) {
    const bStart = new Date(block.start_at).getTime();
    const bEnd = new Date(block.end_at).getTime();
    if (start < bEnd && bStart < end) return "SCHEDULE_BLOCKED";
  }
  for (const appt of input.appointments) {
    if (appt.status === "cancelled") continue;
    if (input.ignoreAppointmentId && appt.id === input.ignoreAppointmentId) {
      continue;
    }
    const aStart = new Date(appt.start_at).getTime();
    const aEnd = new Date(appt.end_at).getTime();
    if (start < aEnd && aStart < end) return "APPOINTMENT_OVERLAP";
  }
  return null;
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

  if (resources.error) return fail("GENERIC", undefined, resources.error.message);
  if (availability.error) {
    return fail("GENERIC", undefined, availability.error.message);
  }
  if (blocks.error) return fail("GENERIC", undefined, blocks.error.message);
  if (appointments.error) {
    return fail("GENERIC", undefined, appointments.error.message);
  }

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
  if (!parsed.success) {
    return fail("VALIDATION", "name", formatZodIssues(parsed.error));
  }
  const gate = await requireClinicAdminWorkspace();
  if (!gate.ok) return gate;

  const { data, error } = await clinicRepository.upsertResource(
    gate.workspace.business.id,
    parsed.data,
  );
  if (error || !data) {
    return fail("GENERIC", undefined, error?.message);
  }
  return { ok: true, data, message: "Profesional guardado." };
}

export async function upsertAvailability(
  input: UpsertClinicAvailabilityInput,
): Promise<ClinicActionResult<ClinicAvailability>> {
  const parsed = upsertClinicAvailabilitySchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", undefined, formatZodIssues(parsed.error));
  }
  const gate = await requireClinicAdminWorkspace();
  if (!gate.ok) return gate;

  const start = parsed.data.start_time.slice(0, 5);
  const end = parsed.data.end_time.slice(0, 5);
  if (end <= start) {
    return fail("INVALID_TIME_ORDER");
  }

  const resource = await clinicRepository.getResource(
    gate.workspace.business.id,
    parsed.data.resource_id,
  );
  if (resource.error || !resource.data) {
    return fail("RESOURCE_NOT_FOUND", "resource_id");
  }

  const { data, error } = await clinicRepository.upsertAvailability(
    gate.workspace.business.id,
    parsed.data,
  );
  if (error || !data) {
    return fail("GENERIC", undefined, error?.message);
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
  if (error) return fail("GENERIC", undefined, error.message);
  return { ok: true, message: "Bloque de disponibilidad eliminado." };
}

export async function createBlock(
  input: CreateClinicBlockInput,
): Promise<ClinicActionResult<ClinicScheduleBlock>> {
  const parsed = createClinicBlockSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", undefined, formatZodIssues(parsed.error));
  }
  const gate = await requireClinicAdminWorkspace();
  if (!gate.ok) return gate;

  if (new Date(parsed.data.end_at) <= new Date(parsed.data.start_at)) {
    return fail("INVALID_TIME_ORDER");
  }

  const { data, error } = await clinicRepository.createBlock(
    gate.workspace.business.id,
    parsed.data,
  );
  if (error || !data) {
    return fail("GENERIC", undefined, error?.message);
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
  if (error) return fail("GENERIC", undefined, error.message);
  return { ok: true, message: "Bloqueo eliminado." };
}

/**
 * AppointmentService facade — usado por UI hoy; listo para tools del Agente IA mañana.
 */
export async function getAvailability(
  input: GetAvailabilityFormInput,
): Promise<ClinicActionResult<AvailabilityQueryData>> {
  const parsed = getAvailabilitySchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", undefined, formatZodIssues(parsed.error));
  }
  const gate = await requireClinicMemberWorkspace();
  if (!gate.ok) return gate;

  const businessId = gate.workspace.business.id;
  const timezone = gate.workspace.business.timezone;

  const resource = await clinicRepository.getResource(
    businessId,
    parsed.data.resource_id,
  );
  if (resource.error || !resource.data) {
    return fail("RESOURCE_NOT_FOUND", "resource_id");
  }
  if (!resource.data.active) {
    return fail("RESOURCE_INACTIVE", "resource_id");
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

  if (weekly.error) return fail("GENERIC", undefined, weekly.error.message);
  if (appointments.error) {
    return fail("GENERIC", undefined, appointments.error.message);
  }
  if (blocks.error) return fail("GENERIC", undefined, blocks.error.message);

  const weeklyRows = weekly.data ?? [];
  const weekday = getWeekdayInTimeZone(parsed.data.date, timezone);
  const dayWindows = weeklyRows.filter(
    (row) => row.active && row.day_of_week === weekday,
  );
  const hasWeeklyForDay = dayWindows.length > 0;
  const durationMinutes =
    parsed.data.duration_minutes ??
    dayWindows[0]?.slot_duration_minutes ??
    null;

  const slots = internalCalendarProvider.getAvailability({
    businessId,
    resourceId: parsed.data.resource_id,
    date: parsed.data.date,
    timezone,
    durationMinutes: parsed.data.duration_minutes,
    weekly: weeklyRows,
    appointments: appointments.data ?? [],
    blocks: blocks.data ?? [],
  });

  return {
    ok: true,
    data: {
      slots,
      hasWeeklyForDay,
      resourceName: resource.data.name,
      resourceActive: resource.data.active,
      durationMinutes,
    },
  };
}

export async function createAppointment(
  input: CreateClinicAppointmentInput,
): Promise<ClinicActionResult<ClinicAppointment>> {
  if (!input.contact_id) return fail("MISSING_CONTACT", "contact_id");
  if (!input.resource_id) return fail("MISSING_RESOURCE", "resource_id");
  if (!input.service_name?.trim()) return fail("MISSING_SERVICE", "service_name");
  if (!input.start_at || !input.end_at) return fail("MISSING_SLOT", "slot");

  const parsed = createClinicAppointmentSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = String(issue?.path[0] ?? "");
    if (path === "contact_id") return fail("MISSING_CONTACT", "contact_id");
    if (path === "resource_id") return fail("MISSING_RESOURCE", "resource_id");
    if (path === "service_name") return fail("MISSING_SERVICE", "service_name");
    if (path === "start_at" || path === "end_at") {
      return fail("MISSING_SLOT", "slot");
    }
    return fail("VALIDATION", undefined, formatZodIssues(parsed.error));
  }
  const gate = await requireClinicAdminWorkspace();
  if (!gate.ok) return gate;

  const businessId = gate.workspace.business.id;
  const timezone = gate.workspace.business.timezone;

  if (new Date(parsed.data.end_at) <= new Date(parsed.data.start_at)) {
    return fail("INVALID_TIME_ORDER", "slot");
  }

  const resource = await clinicRepository.getResource(
    businessId,
    parsed.data.resource_id,
  );
  if (resource.error || !resource.data) {
    return fail("RESOURCE_NOT_FOUND", "resource_id");
  }
  if (!resource.data.active) {
    return fail("RESOURCE_INACTIVE", "resource_id");
  }

  const rangeFrom = new Date(
    new Date(parsed.data.start_at).getTime() - 12 * 3600_000,
  ).toISOString();
  const rangeTo = new Date(
    new Date(parsed.data.end_at).getTime() + 12 * 3600_000,
  ).toISOString();

  const [weekly, appointments, blocks] = await Promise.all([
    clinicRepository.listAvailability(businessId, parsed.data.resource_id),
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
  if (weekly.error) return fail("GENERIC", undefined, weekly.error.message);
  if (appointments.error) {
    return fail("GENERIC", undefined, appointments.error.message);
  }
  if (blocks.error) return fail("GENERIC", undefined, blocks.error.message);

  const conflict = classifyBusyConflict({
    startAt: parsed.data.start_at,
    endAt: parsed.data.end_at,
    appointments: appointments.data ?? [],
    blocks: blocks.data ?? [],
  });
  if (conflict) {
    return fail(conflict, "slot");
  }

  // Segunda validación: el slot debe coincidir con disponibilidad real del día.
  const dateYmd = utcIsoToDateYmd(parsed.data.start_at, timezone);

  const durationMinutes = Math.round(
    (new Date(parsed.data.end_at).getTime() -
      new Date(parsed.data.start_at).getTime()) /
      60_000,
  );

  const slots = internalCalendarProvider.getAvailability({
    businessId,
    resourceId: parsed.data.resource_id,
    date: dateYmd,
    timezone,
    durationMinutes: ([15, 20, 30, 45, 60, 90, 120].includes(durationMinutes)
      ? durationMinutes
      : undefined) as 15 | 20 | 30 | 45 | 60 | 90 | 120 | undefined,
    weekly: weekly.data ?? [],
    appointments: appointments.data ?? [],
    blocks: blocks.data ?? [],
  });

  const weekday = getWeekdayInTimeZone(dateYmd, timezone);
  const hasWeekly = (weekly.data ?? []).some(
    (row) => row.active && row.day_of_week === weekday,
  );
  if (!hasWeekly) {
    return fail("NO_WEEKLY_AVAILABILITY", "date");
  }

  const startMs = new Date(parsed.data.start_at).getTime();
  const endMs = new Date(parsed.data.end_at).getTime();
  const matchesSlot = slots.some(
    (slot) =>
      new Date(slot.start_at).getTime() === startMs &&
      new Date(slot.end_at).getTime() === endMs,
  );
  if (!matchesSlot) {
    return fail("OUTSIDE_AVAILABILITY", "slot");
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
    const mapped = mapTechnicalError(error?.message ?? "");
    return fail(mapped.code, "slot", mapped.error);
  }

  return {
    ok: true,
    data,
    message: "Cita creada correctamente.",
  };
}

export async function rescheduleAppointment(
  input: UpdateClinicAppointmentInput,
): Promise<ClinicActionResult<ClinicAppointment>> {
  const parsed = updateClinicAppointmentSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", undefined, formatZodIssues(parsed.error));
  }
  const gate = await requireClinicAdminWorkspace();
  if (!gate.ok) return gate;

  const businessId = gate.workspace.business.id;
  const timezone = gate.workspace.business.timezone;
  const existing = await clinicRepository.getAppointment(
    businessId,
    parsed.data.id,
  );
  if (existing.error || !existing.data) {
    return fail("APPOINTMENT_NOT_FOUND");
  }

  const nextStart = parsed.data.start_at ?? existing.data.start_at;
  const nextEnd = parsed.data.end_at ?? existing.data.end_at;
  const nextResource = parsed.data.resource_id ?? existing.data.resource_id;
  const isCancel = parsed.data.status === "cancelled";

  if (new Date(nextEnd) <= new Date(nextStart)) {
    return fail("INVALID_TIME_ORDER", "slot");
  }

  if (!isCancel && (parsed.data.start_at || parsed.data.end_at || parsed.data.resource_id)) {
    const resource = await clinicRepository.getResource(businessId, nextResource);
    if (resource.error || !resource.data) {
      return fail("RESOURCE_NOT_FOUND", "resource_id");
    }
    if (!resource.data.active) {
      return fail("RESOURCE_INACTIVE", "resource_id");
    }

    const rangeFrom = new Date(
      new Date(nextStart).getTime() - 12 * 3600_000,
    ).toISOString();
    const rangeTo = new Date(
      new Date(nextEnd).getTime() + 12 * 3600_000,
    ).toISOString();
    const [weekly, appointments, blocks] = await Promise.all([
      clinicRepository.listAvailability(businessId, nextResource),
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
    if (weekly.error) return fail("GENERIC", undefined, weekly.error.message);
    if (appointments.error) {
      return fail("GENERIC", undefined, appointments.error.message);
    }
    if (blocks.error) return fail("GENERIC", undefined, blocks.error.message);

    const conflict = classifyBusyConflict({
      startAt: nextStart,
      endAt: nextEnd,
      appointments: appointments.data ?? [],
      blocks: blocks.data ?? [],
      ignoreAppointmentId: existing.data.id,
    });
    if (conflict) return fail(conflict, "slot");

    const dateYmd = utcIsoToDateYmd(nextStart, timezone);

    const durationMinutes = Math.round(
      (new Date(nextEnd).getTime() - new Date(nextStart).getTime()) / 60_000,
    );
    const slots = internalCalendarProvider.getAvailability({
      businessId,
      resourceId: nextResource,
      date: dateYmd,
      timezone,
      durationMinutes: ([15, 20, 30, 45, 60, 90, 120].includes(durationMinutes)
        ? durationMinutes
        : undefined) as 15 | 20 | 30 | 45 | 60 | 90 | 120 | undefined,
      weekly: weekly.data ?? [],
      appointments: appointments.data ?? [],
      blocks: blocks.data ?? [],
    });

    const weekday = getWeekdayInTimeZone(dateYmd, timezone);
    const hasWeekly = (weekly.data ?? []).some(
      (row) => row.active && row.day_of_week === weekday,
    );
    if (!hasWeekly) return fail("NO_WEEKLY_AVAILABILITY", "date");

    const startMs = new Date(nextStart).getTime();
    const endMs = new Date(nextEnd).getTime();
    const matchesSlot = slots.some(
      (slot) =>
        new Date(slot.start_at).getTime() === startMs &&
        new Date(slot.end_at).getTime() === endMs,
    );
    if (!matchesSlot) {
      return fail("OUTSIDE_AVAILABILITY", "slot");
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
    const mapped = mapTechnicalError(error?.message ?? "");
    return fail(mapped.code, "slot", mapped.error);
  }

  const message = isCancel
    ? "Cita cancelada correctamente."
    : parsed.data.start_at || parsed.data.end_at
      ? "Cita reprogramada correctamente."
      : "Cita actualizada correctamente.";

  return { ok: true, data, message };
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
    return fail("APPOINTMENT_NOT_FOUND", undefined, error?.message);
  }
  return { ok: true, data };
}

/** Trusted (system) API for the AI agent — re-exported as AppointmentService. */
export {
  cancelAppointmentTrusted,
  createAppointmentTrusted,
  getAppointmentTrusted,
  getAvailabilityTrusted,
  listActiveResourcesTrusted,
  listPatientAppointmentsTrusted,
  rescheduleAppointmentTrusted,
  type ClinicTrustedContext,
  type DisplaySlot,
  type TrustedActionResult,
} from "@/services/clinic/appointment-trusted.service";

