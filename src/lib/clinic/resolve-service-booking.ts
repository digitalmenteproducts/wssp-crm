import { restrictWeeklyByServiceWindows } from "@/lib/clinic/service-availability";
import type {
  ClinicAvailability,
  ClinicService,
  ClinicServiceAvailability,
  ClinicServiceResource,
} from "@/types/clinic";
import type { ClinicErrorCode } from "@/lib/clinic/errors";

export type ServiceBookingContext = {
  service: ClinicService;
  durationMinutes: number;
  /** Weekly windows after optional service-specific intersection. */
  weekly: ClinicAvailability[];
  requiresConsultation: boolean;
  consultationServiceId: string | null;
};

export type ServiceBookingFailure = {
  ok: false;
  code: ClinicErrorCode;
};

export type ServiceBookingSuccess = {
  ok: true;
  data: ServiceBookingContext;
};

/**
 * Validates service + resource compatibility and builds weekly windows
 * for slot computation (resource ∩ optional service windows).
 */
export function buildServiceBookingContext(input: {
  service: ClinicService | null | undefined;
  resourceId: string;
  dayOfWeek: number;
  resourceWeekly: ClinicAvailability[];
  links: ClinicServiceResource[];
  serviceAvailability: ClinicServiceAvailability[];
  /** When true, refuse booking if requires_initial_consultation (create path). */
  refuseIfRequiresConsultation?: boolean;
}): ServiceBookingSuccess | ServiceBookingFailure {
  const service = input.service;
  if (!service) return { ok: false, code: "SERVICE_NOT_FOUND" };
  if (!service.active) return { ok: false, code: "SERVICE_INACTIVE" };

  const linked = input.links.filter((l) => l.service_id === service.id);
  if (linked.length > 0) {
    const compatible = linked.some((l) => l.resource_id === input.resourceId);
    if (!compatible) return { ok: false, code: "RESOURCE_NOT_COMPATIBLE" };
  }

  if (
    input.refuseIfRequiresConsultation &&
    service.requires_initial_consultation
  ) {
    return { ok: false, code: "SERVICE_REQUIRES_CONSULTATION" };
  }

  const durationMinutes = service.duration_minutes;
  let weekly = input.resourceWeekly;

  if (service.use_specific_availability) {
    const serviceWindows = input.serviceAvailability
      .filter(
        (w) =>
          w.active &&
          w.service_id === service.id &&
          w.day_of_week === input.dayOfWeek,
      )
      .map((w) => ({
        start_time: w.start_time,
        end_time: w.end_time,
      }));

    if (serviceWindows.length === 0) {
      return {
        ok: true,
        data: {
          service,
          durationMinutes,
          weekly: [],
          requiresConsultation: service.requires_initial_consultation,
          consultationServiceId: service.initial_consultation_service_id,
        },
      };
    }

    weekly = restrictWeeklyByServiceWindows({
      weekly: input.resourceWeekly,
      dayOfWeek: input.dayOfWeek,
      serviceWindows,
      durationMinutes,
    });
  } else {
    // Override slot_duration on windows so provider uses service duration.
    weekly = input.resourceWeekly.map((w) => ({
      ...w,
      slot_duration_minutes: durationMinutes,
    }));
  }

  return {
    ok: true,
    data: {
      service,
      durationMinutes,
      weekly,
      requiresConsultation: service.requires_initial_consultation,
      consultationServiceId: service.initial_consultation_service_id,
    },
  };
}
