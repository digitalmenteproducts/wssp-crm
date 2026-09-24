export type ClinicAppointmentStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

export type ClinicAppointmentSource =
  | "whatsapp_ai"
  | "whatsapp_human"
  | "manual"
  | "web";

export type ClinicCalendarResource = {
  id: string;
  business_id: string;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ClinicAvailability = {
  id: string;
  business_id: string;
  resource_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ClinicScheduleBlock = {
  id: string;
  business_id: string;
  resource_id: string;
  start_at: string;
  end_at: string;
  reason: string;
  created_at: string;
};

export type ClinicAppointment = {
  id: string;
  business_id: string;
  contact_id: string;
  resource_id: string;
  title: string;
  service_name: string;
  /** Nullable for legacy appointments created before clinic_services. */
  service_id: string | null;
  start_at: string;
  end_at: string;
  status: ClinicAppointmentStatus;
  source: ClinicAppointmentSource;
  administrative_notes: string;
  created_at: string;
  updated_at: string;
};

export type ClinicService = {
  id: string;
  business_id: string;
  name: string;
  duration_minutes: number;
  requires_initial_consultation: boolean;
  initial_consultation_service_id: string | null;
  use_specific_availability: boolean;
  active: boolean;
  admin_notes: string;
  created_at: string;
  updated_at: string;
};

export type ClinicServiceResource = {
  id: string;
  business_id: string;
  service_id: string;
  resource_id: string;
  created_at: string;
};

export type ClinicServiceAvailability = {
  id: string;
  business_id: string;
  service_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ClinicServiceListItem = ClinicService & {
  resource_ids: string[];
  resource_names: string[];
};

export type ClinicAppointmentListItem = ClinicAppointment & {
  contact_name: string | null;
  contact_phone: string;
  resource_name: string;
};

export type AvailabilitySlot = {
  start_at: string;
  end_at: string;
};

export type GetAvailabilityInput = {
  businessId: string;
  resourceId: string;
  /** Fecha local YYYY-MM-DD en timezone del business */
  date: string;
  timezone: string;
  durationMinutes?: number;
};

export type CreateAppointmentInput = {
  businessId: string;
  contactId: string;
  resourceId: string;
  title?: string;
  serviceName: string;
  startAt: string;
  endAt: string;
  status?: ClinicAppointmentStatus;
  source?: ClinicAppointmentSource;
  administrativeNotes?: string;
  timezone: string;
};

export type RescheduleAppointmentInput = {
  businessId: string;
  appointmentId: string;
  startAt: string;
  endAt: string;
  timezone: string;
};
