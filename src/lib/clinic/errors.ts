export const CLINIC_ERROR_CODES = [
  "VALIDATION",
  "MISSING_CONTACT",
  "MISSING_RESOURCE",
  "MISSING_SERVICE",
  "MISSING_DATE",
  "MISSING_SLOT",
  "INVALID_TIME_ORDER",
  "RESOURCE_INACTIVE",
  "RESOURCE_NOT_FOUND",
  "SERVICE_NOT_FOUND",
  "SERVICE_INACTIVE",
  "SERVICE_REQUIRES_CONSULTATION",
  "RESOURCE_NOT_COMPATIBLE",
  "NO_WEEKLY_AVAILABILITY",
  "OUTSIDE_AVAILABILITY",
  "SCHEDULE_BLOCKED",
  "APPOINTMENT_OVERLAP",
  "APPOINTMENT_NOT_FOUND",
  "GENERIC",
] as const;

export type ClinicErrorCode = (typeof CLINIC_ERROR_CODES)[number];

export const CLINIC_ERROR_MESSAGES: Record<ClinicErrorCode, string> = {
  VALIDATION: "Revisa los datos del formulario.",
  MISSING_CONTACT: "Selecciona un paciente.",
  MISSING_RESOURCE: "Selecciona un profesional.",
  MISSING_SERVICE: "Indica el servicio o tratamiento.",
  MISSING_DATE: "Selecciona una fecha.",
  MISSING_SLOT: "Selecciona un horario disponible.",
  INVALID_TIME_ORDER:
    "La hora de finalización debe ser posterior a la hora de inicio.",
  RESOURCE_INACTIVE: "Este profesional no está disponible actualmente.",
  RESOURCE_NOT_FOUND: "Profesional no encontrado.",
  SERVICE_NOT_FOUND: "Servicio no encontrado.",
  SERVICE_INACTIVE: "Este servicio no está disponible actualmente.",
  SERVICE_REQUIRES_CONSULTATION:
    "Este tratamiento requiere primero una consulta de valoración.",
  RESOURCE_NOT_COMPATIBLE:
    "Este profesional no realiza el servicio seleccionado.",
  NO_WEEKLY_AVAILABILITY:
    "Este profesional no tiene disponibilidad configurada para este día.",
  OUTSIDE_AVAILABILITY:
    "La hora seleccionada está fuera del horario disponible de este profesional.",
  SCHEDULE_BLOCKED: "Este horario está bloqueado.",
  APPOINTMENT_OVERLAP:
    "Este horario acaba de ser reservado. Selecciona otro.",
  APPOINTMENT_NOT_FOUND: "Cita no encontrada.",
  GENERIC: "No se pudo completar la operación. Inténtalo de nuevo.",
};

export function clinicErrorMessage(
  code: ClinicErrorCode,
  fallback?: string,
): string {
  return CLINIC_ERROR_MESSAGES[code] ?? fallback ?? CLINIC_ERROR_MESSAGES.GENERIC;
}

/** Traduce errores técnicos conocidos a códigos tipados. */
export function mapTechnicalError(message: string): {
  code: ClinicErrorCode;
  error: string;
} {
  if (/clinic_appointments_no_overlap|exclusion|overlap/i.test(message)) {
    return {
      code: "APPOINTMENT_OVERLAP",
      error: CLINIC_ERROR_MESSAGES.APPOINTMENT_OVERLAP,
    };
  }
  if (/inactive/i.test(message)) {
    return {
      code: "RESOURCE_INACTIVE",
      error: CLINIC_ERROR_MESSAGES.RESOURCE_INACTIVE,
    };
  }
  return {
    code: "GENERIC",
    error: CLINIC_ERROR_MESSAGES.GENERIC,
  };
}
