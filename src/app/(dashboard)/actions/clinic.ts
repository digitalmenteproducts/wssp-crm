"use server";

import { revalidatePath } from "next/cache";

import { ROUTES } from "@/config/app";
import * as appointmentService from "@/services/clinic/appointment.service";
import * as contactsRepository from "@/repositories/contacts.repository";
import * as businessService from "@/services/business/business.service";

export type ClinicFormState = {
  error?: string;
  message?: string;
};

export async function upsertClinicResourceAction(
  _prev: ClinicFormState,
  formData: FormData,
): Promise<ClinicFormState> {
  const result = await appointmentService.upsertResource({
    id: String(formData.get("id") ?? "") || undefined,
    name: String(formData.get("name") ?? ""),
    active: formData.get("active") === "on" || formData.get("active") === "true",
  });
  if (!result.ok) return { error: result.error };
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
  if (!result.ok) return { error: result.error };
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
  if (!result.ok) return { error: result.error };
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
  if (!result.ok) return { error: result.error };
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
  if (!result.ok) return { error: result.error };
  revalidatePath(ROUTES.agenda);
  return { message: result.message };
}

export async function createClinicAppointmentAction(
  _prev: ClinicFormState,
  formData: FormData,
): Promise<ClinicFormState> {
  const result = await appointmentService.createAppointment({
    contact_id: String(formData.get("contact_id") ?? ""),
    resource_id: String(formData.get("resource_id") ?? ""),
    service_name: String(formData.get("service_name") ?? ""),
    title: String(formData.get("title") ?? "") || undefined,
    start_at: String(formData.get("start_at") ?? ""),
    end_at: String(formData.get("end_at") ?? ""),
    status: (String(formData.get("status") ?? "confirmed") ||
      "confirmed") as "pending" | "confirmed" | "completed" | "cancelled" | "no_show",
    administrative_notes: String(formData.get("administrative_notes") ?? ""),
  });
  if (!result.ok) return { error: result.error };
  revalidatePath(ROUTES.agenda);
  return { message: result.message };
}

export async function updateClinicAppointmentAction(
  _prev: ClinicFormState,
  formData: FormData,
): Promise<ClinicFormState> {
  const result = await appointmentService.rescheduleAppointment({
    id: String(formData.get("id") ?? ""),
    contact_id: String(formData.get("contact_id") ?? "") || undefined,
    resource_id: String(formData.get("resource_id") ?? "") || undefined,
    service_name: String(formData.get("service_name") ?? "") || undefined,
    title: String(formData.get("title") ?? "") || undefined,
    start_at: String(formData.get("start_at") ?? "") || undefined,
    end_at: String(formData.get("end_at") ?? "") || undefined,
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
  if (!result.ok) return { error: result.error };
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
  if (!result.ok) return { error: result.error };
  revalidatePath(ROUTES.agenda);
  return { message: result.message };
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
