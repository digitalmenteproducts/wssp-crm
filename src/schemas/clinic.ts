import { z } from "zod";

/** Resource weekly slot presets (agenda configuration UI). */
export const clinicSlotDurationSchema = z.union([
  z.literal(15),
  z.literal(20),
  z.literal(30),
  z.literal(45),
  z.literal(60),
  z.literal(90),
  z.literal(120),
]);

/** Structured clinic_services duration — any reasonable booking length. */
export const clinicServiceDurationSchema = z.coerce
  .number()
  .int()
  .min(5, "La duración mínima es 5 minutos.")
  .max(240, "La duración máxima es 240 minutos.");

export const upsertClinicResourceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  active: z.boolean().default(true),
});

export const upsertClinicAvailabilitySchema = z.object({
  id: z.string().uuid().optional(),
  resource_id: z.string().uuid(),
  day_of_week: z.coerce.number().int().min(0).max(6),
  start_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Hora inválida (HH:MM)."),
  end_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Hora inválida (HH:MM)."),
  slot_duration_minutes: clinicSlotDurationSchema.default(30),
  active: z.boolean().default(true),
});

export const createClinicBlockSchema = z.object({
  resource_id: z.string().uuid(),
  start_at: z.string().datetime({ offset: true }),
  end_at: z.string().datetime({ offset: true }),
  reason: z.string().trim().max(500).default(""),
});

export const clinicAppointmentStatusSchema = z.enum([
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
]);

export const createClinicAppointmentSchema = z.object({
  contact_id: z.string().uuid(),
  resource_id: z.string().uuid(),
  service_id: z.string().uuid().optional(),
  service_name: z.string().trim().min(1).max(200),
  title: z.string().trim().max(200).optional(),
  start_at: z.string().datetime({ offset: true }),
  end_at: z.string().datetime({ offset: true }),
  status: clinicAppointmentStatusSchema.default("confirmed"),
  administrative_notes: z.string().trim().max(4000).default(""),
});

export const updateClinicAppointmentSchema = z.object({
  id: z.string().uuid(),
  contact_id: z.string().uuid().optional(),
  resource_id: z.string().uuid().optional(),
  service_id: z.string().uuid().nullable().optional(),
  service_name: z.string().trim().min(1).max(200).optional(),
  title: z.string().trim().max(200).optional(),
  start_at: z.string().datetime({ offset: true }).optional(),
  end_at: z.string().datetime({ offset: true }).optional(),
  status: clinicAppointmentStatusSchema.optional(),
  administrative_notes: z.string().trim().max(4000).optional(),
});

export const getAvailabilitySchema = z.object({
  resource_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  service_id: z.string().uuid().optional(),
  duration_minutes: clinicServiceDurationSchema.optional(),
});

export const upsertClinicServiceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  duration_minutes: clinicServiceDurationSchema.default(30),
  requires_initial_consultation: z.boolean().default(false),
  initial_consultation_service_id: z.string().uuid().nullable().optional(),
  use_specific_availability: z.boolean().default(false),
  active: z.boolean().default(true),
  admin_notes: z.string().trim().max(2000).default(""),
  resource_ids: z.array(z.string().uuid()).default([]),
});

export const upsertClinicServiceAvailabilitySchema = z.object({
  id: z.string().uuid().optional(),
  service_id: z.string().uuid(),
  day_of_week: z.coerce.number().int().min(0).max(6),
  start_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Hora inválida (HH:MM)."),
  end_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Hora inválida (HH:MM)."),
  active: z.boolean().default(true),
});

export type UpsertClinicResourceInput = z.infer<typeof upsertClinicResourceSchema>;
export type UpsertClinicAvailabilityInput = z.infer<
  typeof upsertClinicAvailabilitySchema
>;
export type CreateClinicBlockInput = z.infer<typeof createClinicBlockSchema>;
export type CreateClinicAppointmentInput = z.infer<
  typeof createClinicAppointmentSchema
>;
export type UpdateClinicAppointmentInput = z.infer<
  typeof updateClinicAppointmentSchema
>;
export type GetAvailabilityFormInput = z.infer<typeof getAvailabilitySchema>;
export type UpsertClinicServiceInput = z.infer<typeof upsertClinicServiceSchema>;
export type UpsertClinicServiceAvailabilityInput = z.infer<
  typeof upsertClinicServiceAvailabilitySchema
>;
