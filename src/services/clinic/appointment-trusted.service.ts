/**
 * AppointmentService — trusted (system) API for the AI agent / webhook.
 * Uses the same validation rules as the dashboard facade, but with an
 * explicit business/contact context (no cookie session) and admin client.
 *
 * The agent MUST call these methods — never clinic_* tables directly.
 */
import {
  clinicErrorMessage,
  mapTechnicalError,
  type ClinicErrorCode,
} from "@/lib/clinic/errors";
import { utcIsoToDateYmd } from "@/lib/clinic/datetime";
import { formatSlotClock } from "@/lib/clinic/timezone-display";
import * as clinicAdmin from "@/repositories/clinic-admin.repository";
import {
  getWeekdayInTimeZone,
  internalCalendarProvider,
  zonedLocalToUtcIso,
} from "@/services/clinic/internal-calendar.provider";
import type {
  AvailabilitySlot,
  ClinicAppointment,
  ClinicAppointmentListItem,
  ClinicAppointmentSource,
  ClinicCalendarResource,
} from "@/types/clinic";

export type ClinicTrustedContext = {
  businessId: string;
  timezone: string;
  /** Patient contact — required for create/reschedule/cancel ownership. */
  contactId: string;
};

export type TrustedActionResult<T = undefined> =
  | ({ ok: true; message?: string } & (T extends undefined
      ? { data?: undefined }
      : { data: T }))
  | { ok: false; error: string; code: ClinicErrorCode };

function fail(
  code: ClinicErrorCode,
  override?: string,
): TrustedActionResult<never> {
  return {
    ok: false,
    code,
    error: override ?? clinicErrorMessage(code),
  };
}

function classifyBusy(input: {
  startAt: string;
  endAt: string;
  appointments: Array<
    Pick<ClinicAppointment, "id" | "start_at" | "end_at" | "status">
  >;
  blocks: Array<{ start_at: string; end_at: string }>;
  ignoreAppointmentId?: string;
}): ClinicErrorCode | null {
  const start = new Date(input.startAt).getTime();
  const end = new Date(input.endAt).getTime();
  if (!(end > start)) return "INVALID_TIME_ORDER";
  for (const block of input.blocks) {
    if (
      start < new Date(block.end_at).getTime() &&
      new Date(block.start_at).getTime() < end
    ) {
      return "SCHEDULE_BLOCKED";
    }
  }
  for (const appt of input.appointments) {
    if (appt.status === "cancelled") continue;
    if (input.ignoreAppointmentId && appt.id === input.ignoreAppointmentId) {
      continue;
    }
    if (
      start < new Date(appt.end_at).getTime() &&
      new Date(appt.start_at).getTime() < end
    ) {
      return "APPOINTMENT_OVERLAP";
    }
  }
  return null;
}

export type DisplaySlot = AvailabilitySlot & { display_time: string };

export async function listActiveResourcesTrusted(
  ctx: Pick<ClinicTrustedContext, "businessId">,
): Promise<TrustedActionResult<ClinicCalendarResource[]>> {
  const { data, error } = await clinicAdmin.listResourcesAdmin(ctx.businessId);
  if (error) return fail("GENERIC", error.message);
  return {
    ok: true,
    data: (data ?? []).filter((r) => r.active),
  };
}

export async function getAvailabilityTrusted(
  ctx: ClinicTrustedContext,
  input: {
    resource_id: string;
    date: string;
    time_preference?: "morning" | "afternoon" | "evening" | null;
  },
): Promise<
  TrustedActionResult<{
    slots: DisplaySlot[];
    hasWeeklyForDay: boolean;
    resourceName: string;
    durationMinutes: number | null;
  }>
> {
  const resource = await clinicAdmin.getResourceAdmin(
    ctx.businessId,
    input.resource_id,
  );
  if (resource.error || !resource.data) return fail("RESOURCE_NOT_FOUND");
  if (!resource.data.active) return fail("RESOURCE_INACTIVE");

  const dayStart = zonedLocalToUtcIso(input.date, "00:00", ctx.timezone);
  const dayEnd = zonedLocalToUtcIso(input.date, "23:59", ctx.timezone);
  const rangeTo = new Date(new Date(dayEnd).getTime() + 60_000).toISOString();

  const [weekly, appointments, blocks] = await Promise.all([
    clinicAdmin.listAvailabilityAdmin(ctx.businessId, input.resource_id),
    clinicAdmin.listActiveAppointmentsInRangeAdmin(
      ctx.businessId,
      input.resource_id,
      dayStart,
      rangeTo,
    ),
    clinicAdmin.listBlocksAdmin(ctx.businessId, {
      resourceId: input.resource_id,
      from: dayStart,
      to: rangeTo,
    }),
  ]);

  if (weekly.error) return fail("GENERIC", weekly.error.message);
  if (appointments.error) return fail("GENERIC", appointments.error.message);
  if (blocks.error) return fail("GENERIC", blocks.error.message);

  const weeklyRows = weekly.data ?? [];
  const weekday = getWeekdayInTimeZone(input.date, ctx.timezone);
  const dayWindows = weeklyRows.filter(
    (row) => row.active && row.day_of_week === weekday,
  );
  const hasWeeklyForDay = dayWindows.length > 0;
  const durationMinutes = dayWindows[0]?.slot_duration_minutes ?? null;

  let slots = internalCalendarProvider.getAvailability({
    businessId: ctx.businessId,
    resourceId: input.resource_id,
    date: input.date,
    timezone: ctx.timezone,
    weekly: weeklyRows,
    appointments: appointments.data ?? [],
    blocks: blocks.data ?? [],
  });

  if (input.time_preference) {
    slots = slots.filter((slot) => {
      const hour = Number(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: ctx.timezone,
          hour: "2-digit",
          hourCycle: "h23",
        }).format(new Date(slot.start_at)),
      );
      if (input.time_preference === "morning") return hour < 12;
      if (input.time_preference === "afternoon") return hour >= 12 && hour < 17;
      return hour >= 17;
    });
  }

  const displaySlots: DisplaySlot[] = slots.map((slot) => ({
    ...slot,
    display_time: formatSlotClock(slot.start_at, ctx.timezone),
  }));

  return {
    ok: true,
    data: {
      slots: displaySlots,
      hasWeeklyForDay,
      resourceName: resource.data.name,
      durationMinutes,
    },
  };
}

async function assertSlotStillAvailable(
  ctx: ClinicTrustedContext,
  input: {
    resource_id: string;
    start_at: string;
    end_at: string;
    ignoreAppointmentId?: string;
  },
): Promise<TrustedActionResult> {
  if (new Date(input.end_at) <= new Date(input.start_at)) {
    return fail("INVALID_TIME_ORDER");
  }

  const resource = await clinicAdmin.getResourceAdmin(
    ctx.businessId,
    input.resource_id,
  );
  if (resource.error || !resource.data) return fail("RESOURCE_NOT_FOUND");
  if (!resource.data.active) return fail("RESOURCE_INACTIVE");

  const rangeFrom = new Date(
    new Date(input.start_at).getTime() - 12 * 3600_000,
  ).toISOString();
  const rangeTo = new Date(
    new Date(input.end_at).getTime() + 12 * 3600_000,
  ).toISOString();

  const [weekly, appointments, blocks] = await Promise.all([
    clinicAdmin.listAvailabilityAdmin(ctx.businessId, input.resource_id),
    clinicAdmin.listActiveAppointmentsInRangeAdmin(
      ctx.businessId,
      input.resource_id,
      rangeFrom,
      rangeTo,
    ),
    clinicAdmin.listBlocksAdmin(ctx.businessId, {
      resourceId: input.resource_id,
      from: rangeFrom,
      to: rangeTo,
    }),
  ]);
  if (weekly.error) return fail("GENERIC", weekly.error.message);
  if (appointments.error) return fail("GENERIC", appointments.error.message);
  if (blocks.error) return fail("GENERIC", blocks.error.message);

  const conflict = classifyBusy({
    startAt: input.start_at,
    endAt: input.end_at,
    appointments: appointments.data ?? [],
    blocks: blocks.data ?? [],
    ignoreAppointmentId: input.ignoreAppointmentId,
  });
  if (conflict) return fail(conflict);

  const dateYmd = utcIsoToDateYmd(input.start_at, ctx.timezone);
  const weekday = getWeekdayInTimeZone(dateYmd, ctx.timezone);
  const hasWeekly = (weekly.data ?? []).some(
    (row) => row.active && row.day_of_week === weekday,
  );
  if (!hasWeekly) return fail("NO_WEEKLY_AVAILABILITY");

  const durationMinutes = Math.round(
    (new Date(input.end_at).getTime() - new Date(input.start_at).getTime()) /
      60_000,
  );
  const slots = internalCalendarProvider.getAvailability({
    businessId: ctx.businessId,
    resourceId: input.resource_id,
    date: dateYmd,
    timezone: ctx.timezone,
    durationMinutes: ([15, 20, 30, 45, 60, 90, 120].includes(durationMinutes)
      ? durationMinutes
      : undefined) as 15 | 20 | 30 | 45 | 60 | 90 | 120 | undefined,
    weekly: weekly.data ?? [],
    appointments: appointments.data ?? [],
    blocks: blocks.data ?? [],
  });

  const startMs = new Date(input.start_at).getTime();
  const endMs = new Date(input.end_at).getTime();
  const matches = slots.some(
    (slot) =>
      new Date(slot.start_at).getTime() === startMs &&
      new Date(slot.end_at).getTime() === endMs,
  );
  if (!matches) return fail("OUTSIDE_AVAILABILITY");
  return { ok: true };
}

export async function createAppointmentTrusted(
  ctx: ClinicTrustedContext,
  input: {
    resource_id: string;
    service_name: string;
    start_at: string;
    end_at: string;
    title?: string;
    source?: ClinicAppointmentSource;
  },
): Promise<TrustedActionResult<ClinicAppointment>> {
  const check = await assertSlotStillAvailable(ctx, {
    resource_id: input.resource_id,
    start_at: input.start_at,
    end_at: input.end_at,
  });
  if (!check.ok) return check;

  const title = input.title?.trim() || input.service_name.trim() || "Cita";
  const { data, error } = await clinicAdmin.insertAppointmentAdmin(
    ctx.businessId,
    {
      contact_id: ctx.contactId,
      resource_id: input.resource_id,
      title,
      service_name: input.service_name.trim(),
      start_at: input.start_at,
      end_at: input.end_at,
      status: "confirmed",
      source: input.source ?? "whatsapp_ai",
      administrative_notes: "",
    },
  );

  if (error || !data) {
    const mapped = mapTechnicalError(error?.message ?? "");
    return fail(mapped.code, mapped.error);
  }
  return { ok: true, data, message: "Cita creada correctamente." };
}

export async function listPatientAppointmentsTrusted(
  ctx: ClinicTrustedContext,
): Promise<TrustedActionResult<ClinicAppointmentListItem[]>> {
  const { data, error } = await clinicAdmin.listContactAppointmentsAdmin(
    ctx.businessId,
    ctx.contactId,
    { futureOnly: true },
  );
  if (error) return fail("GENERIC", error.message);
  return { ok: true, data: data ?? [] };
}

export async function rescheduleAppointmentTrusted(
  ctx: ClinicTrustedContext,
  input: {
    appointment_id: string;
    start_at: string;
    end_at: string;
    resource_id?: string;
  },
): Promise<TrustedActionResult<ClinicAppointment>> {
  const existing = await clinicAdmin.getAppointmentAdmin(
    ctx.businessId,
    input.appointment_id,
  );
  if (existing.error || !existing.data) return fail("APPOINTMENT_NOT_FOUND");
  if (existing.data.contact_id !== ctx.contactId) {
    return fail("APPOINTMENT_NOT_FOUND");
  }
  if (existing.data.status === "cancelled") {
    return fail("APPOINTMENT_NOT_FOUND");
  }

  const resourceId = input.resource_id ?? existing.data.resource_id;
  const check = await assertSlotStillAvailable(ctx, {
    resource_id: resourceId,
    start_at: input.start_at,
    end_at: input.end_at,
    ignoreAppointmentId: existing.data.id,
  });
  if (!check.ok) return check;

  const { data, error } = await clinicAdmin.updateAppointmentAdmin(
    ctx.businessId,
    existing.data.id,
    {
      resource_id: resourceId,
      start_at: input.start_at,
      end_at: input.end_at,
    },
  );
  if (error || !data) {
    const mapped = mapTechnicalError(error?.message ?? "");
    return fail(mapped.code, mapped.error);
  }
  return { ok: true, data, message: "Cita reprogramada correctamente." };
}

export async function cancelAppointmentTrusted(
  ctx: ClinicTrustedContext,
  appointmentId: string,
): Promise<TrustedActionResult<ClinicAppointment>> {
  const existing = await clinicAdmin.getAppointmentAdmin(
    ctx.businessId,
    appointmentId,
  );
  if (existing.error || !existing.data) return fail("APPOINTMENT_NOT_FOUND");
  if (existing.data.contact_id !== ctx.contactId) {
    return fail("APPOINTMENT_NOT_FOUND");
  }
  if (existing.data.status === "cancelled") {
    return fail("APPOINTMENT_NOT_FOUND");
  }

  const { data, error } = await clinicAdmin.updateAppointmentAdmin(
    ctx.businessId,
    existing.data.id,
    { status: "cancelled" },
  );
  if (error || !data) {
    const mapped = mapTechnicalError(error?.message ?? "");
    return fail(mapped.code, mapped.error);
  }
  return { ok: true, data, message: "Cita cancelada correctamente." };
}

export async function getAppointmentTrusted(
  ctx: ClinicTrustedContext,
  appointmentId: string,
): Promise<TrustedActionResult<ClinicAppointment>> {
  const existing = await clinicAdmin.getAppointmentAdmin(
    ctx.businessId,
    appointmentId,
  );
  if (existing.error || !existing.data) return fail("APPOINTMENT_NOT_FOUND");
  if (existing.data.contact_id !== ctx.contactId) {
    return fail("APPOINTMENT_NOT_FOUND");
  }
  return { ok: true, data: existing.data };
}
