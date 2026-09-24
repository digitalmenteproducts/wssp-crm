import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ClinicAppointment,
  ClinicAppointmentListItem,
  ClinicAvailability,
  ClinicCalendarResource,
  ClinicScheduleBlock,
} from "@/types/clinic";

/** Admin client helpers for webhook/agent paths (bypass session RLS). */

export async function listResourcesAdmin(businessId: string) {
  const supabase = createAdminClient();
  return supabase
    .from("clinic_calendar_resources")
    .select("*")
    .eq("business_id", businessId)
    .order("name", { ascending: true })
    .returns<ClinicCalendarResource[]>();
}

export async function getResourceAdmin(businessId: string, resourceId: string) {
  const supabase = createAdminClient();
  return supabase
    .from("clinic_calendar_resources")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", resourceId)
    .maybeSingle<ClinicCalendarResource>();
}

export async function listAvailabilityAdmin(
  businessId: string,
  resourceId?: string,
) {
  const supabase = createAdminClient();
  let q = supabase
    .from("clinic_availability")
    .select("*")
    .eq("business_id", businessId)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });
  if (resourceId) q = q.eq("resource_id", resourceId);
  return q.returns<ClinicAvailability[]>();
}

export async function listBlocksAdmin(
  businessId: string,
  input?: { resourceId?: string; from?: string; to?: string },
) {
  const supabase = createAdminClient();
  let q = supabase
    .from("clinic_schedule_blocks")
    .select("*")
    .eq("business_id", businessId)
    .order("start_at", { ascending: true });
  if (input?.resourceId) q = q.eq("resource_id", input.resourceId);
  if (input?.from) q = q.gte("end_at", input.from);
  if (input?.to) q = q.lte("start_at", input.to);
  return q.returns<ClinicScheduleBlock[]>();
}

export async function listActiveAppointmentsInRangeAdmin(
  businessId: string,
  resourceId: string,
  fromIso: string,
  toIso: string,
) {
  const supabase = createAdminClient();
  return supabase
    .from("clinic_appointments")
    .select("*")
    .eq("business_id", businessId)
    .eq("resource_id", resourceId)
    .neq("status", "cancelled")
    .lt("start_at", toIso)
    .gt("end_at", fromIso)
    .returns<ClinicAppointment[]>();
}

export async function listContactAppointmentsAdmin(
  businessId: string,
  contactId: string,
  options?: { futureOnly?: boolean },
) {
  const supabase = createAdminClient();
  let q = supabase
    .from("clinic_appointments")
    .select("*, clinic_calendar_resources(name)")
    .eq("business_id", businessId)
    .eq("contact_id", contactId)
    .neq("status", "cancelled")
    .order("start_at", { ascending: true });

  if (options?.futureOnly) {
    q = q.gte("start_at", new Date().toISOString());
  }

  const result = await q;
  if (result.error) {
    return { data: null as ClinicAppointmentListItem[] | null, error: result.error };
  }

  const rows = (result.data ?? []).map((row) => {
    const r = row as ClinicAppointment & {
      clinic_calendar_resources?: { name: string } | null;
    };
    return {
      ...r,
      contact_name: null,
      contact_phone: "",
      resource_name: r.clinic_calendar_resources?.name ?? "",
    } satisfies ClinicAppointmentListItem;
  });

  return { data: rows, error: null };
}

export async function getAppointmentAdmin(
  businessId: string,
  appointmentId: string,
) {
  const supabase = createAdminClient();
  return supabase
    .from("clinic_appointments")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", appointmentId)
    .maybeSingle<ClinicAppointment>();
}

export async function insertAppointmentAdmin(
  businessId: string,
  input: Omit<
    ClinicAppointment,
    "id" | "business_id" | "created_at" | "updated_at"
  >,
) {
  const supabase = createAdminClient();
  return supabase
    .from("clinic_appointments")
    .insert({ business_id: businessId, ...input })
    .select("*")
    .single<ClinicAppointment>();
}

export async function updateAppointmentAdmin(
  businessId: string,
  appointmentId: string,
  patch: Partial<
    Pick<
      ClinicAppointment,
      | "resource_id"
      | "title"
      | "service_name"
      | "start_at"
      | "end_at"
      | "status"
      | "administrative_notes"
    >
  >,
) {
  const supabase = createAdminClient();
  return supabase
    .from("clinic_appointments")
    .update(patch)
    .eq("business_id", businessId)
    .eq("id", appointmentId)
    .select("*")
    .single<ClinicAppointment>();
}
