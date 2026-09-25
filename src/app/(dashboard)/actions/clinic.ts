"use server";

import { revalidatePath } from "next/cache";

import { ROUTES } from "@/config/app";
import {
  clinicErrorMessage,
  type ClinicErrorCode,
} from "@/lib/clinic/errors";
import { formatAppointmentRange } from "@/lib/clinic/timezone-display";
import * as appointmentService from "@/services/clinic/appointment.service";
import * as clinicServicesService from "@/services/clinic/services.service";
import * as contactsRepository from "@/repositories/contacts.repository";
import * as businessService from "@/services/business/business.service";

export type ClinicFormState = {
  error?: string;
  code?: ClinicErrorCode;
  field?: string;
  message?: string;
  summary?: string;
};

type ClinicServiceFail = { ok: false; error: string; code?: ClinicErrorCode; field?: string };

function fromServiceFail(result: ClinicServiceFail): ClinicFormState {
  return {
    error: result.error,
    code: result.code,
    field: result.field,
  };
}

export async function upsertClinicResourceAction(
  _prev: ClinicFormState,
  formData: FormData,
): Promise<ClinicFormState> {
  const result = await appointmentService.upsertResource({
    id: String(formData.get("id") ?? "") || undefined,
    name: String(formData.get("name") ?? ""),
    active: formData.get("active") === "on" || formData.get("active") === "true",
  });
  if (!result.ok) return fromServiceFail(result);
  revalidatePath(ROUTES.agenda);
  return { message: result.message };
}

export async function upsertClinicAvailabilityAction(
  _prev: ClinicFormState,
  formData: FormData,
): Promise<ClinicFormState> {
  const result = await appointmentService.upsertAvailability({
    id: String(formData.get("id") ?? "") || undefined,
    resource_id: String(formData.get("resource_id") ?? ""),
    day_of_week: Number(formData.get("day_of_week") ?? 1),
    start_time: String(formData.get("start_time") ?? ""),
    end_time: String(formData.get("end_time") ?? ""),
    slot_duration_minutes: Number(
      formData.get("slot_duration_minutes") ?? 30,
    ) as 15 | 20 | 30 | 45 | 60 | 90 | 120,
    active: formData.get("active") !== "false",
  });
  if (!result.ok) return fromServiceFail(result);
  revalidatePath(ROUTES.agenda);
  return { message: result.message };
}

export async function deleteClinicAvailabilityAction(
  _prev: ClinicFormState,
  formData: FormData,
): Promise<ClinicFormState> {
  const result = await appointmentService.deleteAvailability(
    String(formData.get("id") ?? ""),
  );
  if (!result.ok) return fromServiceFail(result);
  revalidatePath(ROUTES.agenda);
  return { message: result.message };
}

export async function createClinicBlockAction(
  _prev: ClinicFormState,
  formData: FormData,
): Promise<ClinicFormState> {
  const result = await appointmentService.createBlock({
    resource_id: String(formData.get("resource_id") ?? ""),
    start_at: String(formData.get("start_at") ?? ""),
    end_at: String(formData.get("end_at") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });
  if (!result.ok) return fromServiceFail(result);
  revalidatePath(ROUTES.agenda);
  return { message: result.message };
}

export async function deleteClinicBlockAction(
  _prev: ClinicFormState,
  formData: FormData,
): Promise<ClinicFormState> {
  const result = await appointmentService.deleteBlock(
    String(formData.get("id") ?? ""),
  );
  if (!result.ok) return fromServiceFail(result);
  revalidatePath(ROUTES.agenda);
  return { message: result.message };
}

export async function createClinicAppointmentAction(
  _prev: ClinicFormState,
  formData: FormData,
): Promise<ClinicFormState> {
  const contactId = String(formData.get("contact_id") ?? "");
  const resourceId = String(formData.get("resource_id") ?? "");
  const serviceName = String(formData.get("service_name") ?? "");
  const startAt = String(formData.get("start_at") ?? "");
  const endAt = String(formData.get("end_at") ?? "");
  const date = String(formData.get("date") ?? "");

  if (!contactId) {
    return {
      error: clinicErrorMessage("MISSING_CONTACT"),
      code: "MISSING_CONTACT",
      field: "contact_id",
    };
  }
  if (!resourceId) {
    return {
      error: clinicErrorMessage("MISSING_RESOURCE"),
      code: "MISSING_RESOURCE",
      field: "resource_id",
    };
  }
  if (!serviceName.trim()) {
    return {
      error: clinicErrorMessage("MISSING_SERVICE"),
      code: "MISSING_SERVICE",
      field: "service_name",
    };
  }
  if (!date) {
    return {
      error: clinicErrorMessage("MISSING_DATE"),
      code: "MISSING_DATE",
      field: "date",
    };
  }
  if (!startAt || !endAt) {
    return {
      error: clinicErrorMessage("MISSING_SLOT"),
      code: "MISSING_SLOT",
      field: "slot",
    };
  }

  const serviceIdRaw = String(formData.get("service_id") ?? "").trim();

  const result = await appointmentService.createAppointment({
    contact_id: contactId,
    resource_id: resourceId,
    service_id: serviceIdRaw || undefined,
    service_name: serviceName,
    title: String(formData.get("title") ?? "") || undefined,
    start_at: startAt,
    end_at: endAt,
    status: (String(formData.get("status") ?? "confirmed") ||
      "confirmed") as
      | "pending"
      | "confirmed"
      | "completed"
      | "cancelled"
      | "no_show",
    administrative_notes: String(formData.get("administrative_notes") ?? ""),
  });
  if (!result.ok) return fromServiceFail(result);

  const workspace = await businessService.getCurrentWorkspace();
  const timezone =
    workspace.ok && workspace.workspace
      ? workspace.workspace.business.timezone
      : "UTC";
  const contactName = String(formData.get("contact_label") ?? "Paciente");
  const resourceName = String(formData.get("resource_label") ?? "Profesional");
  const summary = `${contactName} · ${resourceName} · ${formatAppointmentRange(
    startAt,
    endAt,
    timezone,
  )}`;

  revalidatePath(ROUTES.agenda);
  return {
    message: result.message ?? "Cita creada correctamente.",
    summary,
  };
}

export async function updateClinicAppointmentAction(
  _prev: ClinicFormState,
  formData: FormData,
): Promise<ClinicFormState> {
  const startAt = String(formData.get("start_at") ?? "") || undefined;
  const endAt = String(formData.get("end_at") ?? "") || undefined;
  const date = String(formData.get("date") ?? "");

  if (formData.has("start_at") || formData.has("date")) {
    if (!date) {
      return {
        error: clinicErrorMessage("MISSING_DATE"),
        code: "MISSING_DATE",
        field: "date",
      };
    }
    if (!startAt || !endAt) {
      return {
        error: clinicErrorMessage("MISSING_SLOT"),
        code: "MISSING_SLOT",
        field: "slot",
      };
    }
  }

  const result = await appointmentService.rescheduleAppointment({
    id: String(formData.get("id") ?? ""),
    contact_id: String(formData.get("contact_id") ?? "") || undefined,
    resource_id: String(formData.get("resource_id") ?? "") || undefined,
    service_name: String(formData.get("service_name") ?? "") || undefined,
    title: String(formData.get("title") ?? "") || undefined,
    start_at: startAt,
    end_at: endAt,
    status: (String(formData.get("status") ?? "") || undefined) as
      | "pending"
      | "confirmed"
      | "completed"
      | "cancelled"
      | "no_show"
      | undefined,
    administrative_notes:
      String(formData.get("administrative_notes") ?? "") || undefined,
  });
  if (!result.ok) return fromServiceFail(result);
  revalidatePath(ROUTES.agenda);
  return { message: result.message };
}

export async function cancelClinicAppointmentAction(
  _prev: ClinicFormState,
  formData: FormData,
): Promise<ClinicFormState> {
  const result = await appointmentService.cancelAppointment(
    String(formData.get("id") ?? ""),
  );
  if (!result.ok) return fromServiceFail(result);
  revalidatePath(ROUTES.agenda);
  return { message: result.message ?? "Cita cancelada correctamente." };
}

export async function getClinicAvailabilityAction(input: {
  resource_id: string;
  date: string;
  service_id?: string;
  duration_minutes?: number;
}): Promise<
  | {
      ok: true;
      slots: Array<{ start_at: string; end_at: string }>;
      hasWeeklyForDay: boolean;
      resourceName: string;
      durationMinutes: number | null;
    }
  | { ok: false; error: string; code?: ClinicErrorCode; field?: string }
> {
  const result = await appointmentService.getAvailability({
    resource_id: input.resource_id,
    date: input.date,
    service_id: input.service_id,
    duration_minutes: input.duration_minutes,
  });
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      code: result.code,
      field: result.field,
    };
  }
  return {
    ok: true,
    slots: result.data.slots,
    hasWeeklyForDay: result.data.hasWeeklyForDay,
    resourceName: result.data.resourceName,
    durationMinutes: result.data.durationMinutes,
  };
}

export async function listContactsForAgendaAction(): Promise<
  | { ok: true; contacts: Array<{ id: string; name: string | null; phone: string }> }
  | { ok: false; error: string }
> {
  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return { ok: false, error: workspace.ok ? "Sin empresa." : workspace.error };
  }
  const { data, error } = await contactsRepository.listContactsSimple(
    workspace.workspace.business.id,
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true, contacts: data ?? [] };
}

export async function upsertClinicServiceAction(
  _prev: ClinicFormState,
  formData: FormData,
): Promise<ClinicFormState> {
  const resourceIds = formData.getAll("resource_ids").map(String);
  let availability: clinicServicesService.UpsertClinicServicePayload["availability"];
  const availabilityJson = String(formData.get("availability_json") ?? "").trim();
  if (availabilityJson) {
    try {
      const parsed = JSON.parse(availabilityJson) as unknown;
      if (!Array.isArray(parsed)) {
        return { error: "Formato de disponibilidad inválido.", code: "VALIDATION" };
      }
      availability = parsed as clinicServicesService.UpsertClinicServicePayload["availability"];
    } catch {
      return { error: "Formato de disponibilidad inválido.", code: "VALIDATION" };
    }
  }

  const initialRaw = String(formData.get("initial_consultation_service_id") ?? "").trim();

  const result = await clinicServicesService.upsertService({
    id: String(formData.get("id") ?? "") || undefined,
    name: String(formData.get("name") ?? ""),
    duration_minutes: Number(formData.get("duration_minutes") ?? 30),
    requires_initial_consultation:
      formData.get("requires_initial_consultation") === "on" ||
      formData.get("requires_initial_consultation") === "true",
    initial_consultation_service_id: initialRaw ? initialRaw : null,
    use_specific_availability:
      formData.get("use_specific_availability") === "on" ||
      formData.get("use_specific_availability") === "true",
    active:
      formData.get("active") === "on" ||
      formData.get("active") === "true",
    admin_notes: String(formData.get("admin_notes") ?? ""),
    resource_ids: resourceIds.filter(Boolean),
    availability,
  });
  if (!result.ok) return fromServiceFail(result);
  revalidatePath(ROUTES.servicios);
  revalidatePath(ROUTES.agenda);
  return { message: result.message };
}

export async function deleteClinicServiceAvailabilityAction(
  _prev: ClinicFormState,
  formData: FormData,
): Promise<ClinicFormState> {
  const result = await clinicServicesService.deleteServiceAvailability(
    String(formData.get("id") ?? ""),
  );
  if (!result.ok) return fromServiceFail(result);
  revalidatePath(ROUTES.servicios);
  return { message: result.message };
}
