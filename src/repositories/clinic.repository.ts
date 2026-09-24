import { createClient } from "@/lib/supabase/server";
import type {
  ClinicAppointment,
  ClinicAppointmentListItem,
  ClinicAvailability,
  ClinicCalendarResource,
  ClinicScheduleBlock,
  ClinicService,
  ClinicServiceAvailability,
  ClinicServiceResource,
} from "@/types/clinic";

export async function listResources(businessId: string) {
  const supabase = await createClient();
  return supabase
    .from("clinic_calendar_resources")
    .select("*")
    .eq("business_id", businessId)
    .order("name", { ascending: true })
    .returns<ClinicCalendarResource[]>();
}

export async function getResource(businessId: string, resourceId: string) {
  const supabase = await createClient();
  return supabase
    .from("clinic_calendar_resources")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", resourceId)
    .maybeSingle<ClinicCalendarResource>();
}

export async function upsertResource(
  businessId: string,
  input: { id?: string; name: string; active: boolean },
) {
  const supabase = await createClient();
  if (input.id) {
    return supabase
      .from("clinic_calendar_resources")
      .update({ name: input.name, active: input.active })
      .eq("business_id", businessId)
      .eq("id", input.id)
      .select("*")
      .single<ClinicCalendarResource>();
  }
  return supabase
    .from("clinic_calendar_resources")
    .insert({
      business_id: businessId,
      name: input.name,
      active: input.active,
    })
    .select("*")
    .single<ClinicCalendarResource>();
}

export async function listAvailability(businessId: string, resourceId?: string) {
  const supabase = await createClient();
  let q = supabase
    .from("clinic_availability")
    .select("*")
    .eq("business_id", businessId)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });
  if (resourceId) {
    q = q.eq("resource_id", resourceId);
  }
  return q.returns<ClinicAvailability[]>();
}

export async function upsertAvailability(
  businessId: string,
  input: {
    id?: string;
    resource_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    slot_duration_minutes: number;
    active: boolean;
  },
) {
  const supabase = await createClient();
  const startTime =
    input.start_time.length === 5 ? `${input.start_time}:00` : input.start_time;
  const endTime =
    input.end_time.length === 5 ? `${input.end_time}:00` : input.end_time;

  if (input.id) {
    return supabase
      .from("clinic_availability")
      .update({
        resource_id: input.resource_id,
        day_of_week: input.day_of_week,
        start_time: startTime,
        end_time: endTime,
        slot_duration_minutes: input.slot_duration_minutes,
        active: input.active,
      })
      .eq("business_id", businessId)
      .eq("id", input.id)
      .select("*")
      .single<ClinicAvailability>();
  }

  return supabase
    .from("clinic_availability")
    .insert({
      business_id: businessId,
      resource_id: input.resource_id,
      day_of_week: input.day_of_week,
      start_time: startTime,
      end_time: endTime,
      slot_duration_minutes: input.slot_duration_minutes,
      active: input.active,
    })
    .select("*")
    .single<ClinicAvailability>();
}

export async function deleteAvailability(businessId: string, id: string) {
  const supabase = await createClient();
  return supabase
    .from("clinic_availability")
    .delete()
    .eq("business_id", businessId)
    .eq("id", id);
}

export async function listBlocks(
  businessId: string,
  input?: { resourceId?: string; from?: string; to?: string },
) {
  const supabase = await createClient();
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

export async function createBlock(
  businessId: string,
  input: {
    resource_id: string;
    start_at: string;
    end_at: string;
    reason: string;
  },
) {
  const supabase = await createClient();
  return supabase
    .from("clinic_schedule_blocks")
    .insert({
      business_id: businessId,
      resource_id: input.resource_id,
      start_at: input.start_at,
      end_at: input.end_at,
      reason: input.reason,
    })
    .select("*")
    .single<ClinicScheduleBlock>();
}

export async function deleteBlock(businessId: string, id: string) {
  const supabase = await createClient();
  return supabase
    .from("clinic_schedule_blocks")
    .delete()
    .eq("business_id", businessId)
    .eq("id", id);
}

export async function listAppointments(
  businessId: string,
  input?: { from?: string; to?: string; resourceId?: string },
) {
  const supabase = await createClient();
  let q = supabase
    .from("clinic_appointments")
    .select(
      "*, contacts(name, phone), clinic_calendar_resources(name)",
    )
    .eq("business_id", businessId)
    .order("start_at", { ascending: true });
  if (input?.from) q = q.gte("start_at", input.from);
  if (input?.to) q = q.lte("start_at", input.to);
  if (input?.resourceId) q = q.eq("resource_id", input.resourceId);

  const result = await q;
  if (result.error) {
    return {
      data: null as ClinicAppointmentListItem[] | null,
      error: result.error,
    };
  }

  const rows = (result.data ?? []).map((row) => {
    const r = row as ClinicAppointment & {
      contacts?: { name: string | null; phone: string } | null;
      clinic_calendar_resources?: { name: string } | null;
    };
    return {
      id: r.id,
      business_id: r.business_id,
      contact_id: r.contact_id,
      resource_id: r.resource_id,
      title: r.title,
      service_name: r.service_name,
      service_id: r.service_id ?? null,
      start_at: r.start_at,
      end_at: r.end_at,
      status: r.status,
      source: r.source,
      administrative_notes: r.administrative_notes,
      created_at: r.created_at,
      updated_at: r.updated_at,
      contact_name: r.contacts?.name ?? null,
      contact_phone: r.contacts?.phone ?? "",
      resource_name: r.clinic_calendar_resources?.name ?? "",
    } satisfies ClinicAppointmentListItem;
  });

  return { data: rows, error: null };
}

export async function getAppointment(businessId: string, appointmentId: string) {
  const supabase = await createClient();
  return supabase
    .from("clinic_appointments")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", appointmentId)
    .maybeSingle<ClinicAppointment>();
}

export async function listActiveAppointmentsInRange(
  businessId: string,
  resourceId: string,
  fromIso: string,
  toIso: string,
) {
  const supabase = await createClient();
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

export async function insertAppointment(
  businessId: string,
  input: Omit<ClinicAppointment, "id" | "business_id" | "created_at" | "updated_at">,
) {
  const supabase = await createClient();
  return supabase
    .from("clinic_appointments")
    .insert({
      business_id: businessId,
      ...input,
    })
    .select("*")
    .single<ClinicAppointment>();
}

export async function updateAppointment(
  businessId: string,
  appointmentId: string,
  patch: Partial<
    Pick<
      ClinicAppointment,
      | "contact_id"
      | "resource_id"
      | "title"
      | "service_name"
      | "service_id"
      | "start_at"
      | "end_at"
      | "status"
      | "administrative_notes"
    >
  >,
) {
  const supabase = await createClient();
  return supabase
    .from("clinic_appointments")
    .update(patch)
    .eq("business_id", businessId)
    .eq("id", appointmentId)
    .select("*")
    .single<ClinicAppointment>();
}

// ---------------------------------------------------------------------------
// clinic_services
// ---------------------------------------------------------------------------

export async function listServices(businessId: string) {
  const supabase = await createClient();
  return supabase
    .from("clinic_services")
    .select("*")
    .eq("business_id", businessId)
    .order("name", { ascending: true })
    .returns<ClinicService[]>();
}

export async function getService(businessId: string, serviceId: string) {
  const supabase = await createClient();
  return supabase
    .from("clinic_services")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", serviceId)
    .maybeSingle<ClinicService>();
}

export async function upsertService(
  businessId: string,
  input: {
    id?: string;
    name: string;
    duration_minutes: number;
    requires_initial_consultation: boolean;
    initial_consultation_service_id: string | null;
    use_specific_availability: boolean;
    active: boolean;
    admin_notes: string;
  },
) {
  const supabase = await createClient();
  const row = {
    business_id: businessId,
    name: input.name,
    duration_minutes: input.duration_minutes,
    requires_initial_consultation: input.requires_initial_consultation,
    initial_consultation_service_id: input.initial_consultation_service_id,
    use_specific_availability: input.use_specific_availability,
    active: input.active,
    admin_notes: input.admin_notes,
  };
  if (input.id) {
    return supabase
      .from("clinic_services")
      .update(row)
      .eq("business_id", businessId)
      .eq("id", input.id)
      .select("*")
      .single<ClinicService>();
  }
  return supabase
    .from("clinic_services")
    .insert(row)
    .select("*")
    .single<ClinicService>();
}

export async function listServiceResourceLinks(businessId: string, serviceId?: string) {
  const supabase = await createClient();
  let q = supabase
    .from("clinic_service_resources")
    .select("*")
    .eq("business_id", businessId);
  if (serviceId) q = q.eq("service_id", serviceId);
  return q.returns<ClinicServiceResource[]>();
}

export async function replaceServiceResources(
  businessId: string,
  serviceId: string,
  resourceIds: string[],
) {
  const supabase = await createClient();
  await supabase
    .from("clinic_service_resources")
    .delete()
    .eq("business_id", businessId)
    .eq("service_id", serviceId);
  if (resourceIds.length === 0) {
    return { data: [] as ClinicServiceResource[], error: null };
  }
  return supabase
    .from("clinic_service_resources")
    .insert(
      resourceIds.map((resource_id) => ({
        business_id: businessId,
        service_id: serviceId,
        resource_id,
      })),
    )
    .select("*")
    .returns<ClinicServiceResource[]>();
}

export async function listServiceAvailability(businessId: string, serviceId: string) {
  const supabase = await createClient();
  return supabase
    .from("clinic_service_availability")
    .select("*")
    .eq("business_id", businessId)
    .eq("service_id", serviceId)
    .order("day_of_week", { ascending: true })
    .returns<ClinicServiceAvailability[]>();
}

export async function upsertServiceAvailability(
  businessId: string,
  input: {
    id?: string;
    service_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    active: boolean;
  },
) {
  const supabase = await createClient();
  const row = {
    business_id: businessId,
    service_id: input.service_id,
    day_of_week: input.day_of_week,
    start_time: input.start_time.length === 5 ? `${input.start_time}:00` : input.start_time,
    end_time: input.end_time.length === 5 ? `${input.end_time}:00` : input.end_time,
    active: input.active,
  };
  if (input.id) {
    return supabase
      .from("clinic_service_availability")
      .update(row)
      .eq("business_id", businessId)
      .eq("id", input.id)
      .select("*")
      .single<ClinicServiceAvailability>();
  }
  return supabase
    .from("clinic_service_availability")
    .insert(row)
    .select("*")
    .single<ClinicServiceAvailability>();
}

export async function deleteServiceAvailability(
  businessId: string,
  availabilityId: string,
) {
  const supabase = await createClient();
  return supabase
    .from("clinic_service_availability")
    .delete()
    .eq("business_id", businessId)
    .eq("id", availabilityId);
}
