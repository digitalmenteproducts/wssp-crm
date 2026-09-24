import {
  buildAppointmentIntent,
  clearAppointmentIntent,
  type AgentConversationMetadata,
  type AppointmentIntentState,
} from "@/lib/ai/appointment-intent";
import { isAffirmativeConfirmation } from "@/lib/ai/confirmation";
import { resolveRelativeDate } from "@/lib/ai/relative-dates";
import {
  formatAppointmentRange,
  formatTimezoneLabel,
} from "@/lib/clinic/timezone-display";
import { hasClinicAgenda } from "@/lib/industry";
import * as appointmentService from "@/services/clinic/appointment.service";
import type { ClinicTrustedContext } from "@/services/clinic/appointment.service";
import type { BusinessIndustry } from "@/types/business";

export const CLINIC_TOOL_NAMES = [
  "clinic_list_resources",
  "clinic_get_availability",
  "clinic_list_my_appointments",
  "clinic_create_appointment",
  "clinic_reschedule_appointment",
  "clinic_cancel_appointment",
] as const;

export type ClinicToolName = (typeof CLINIC_TOOL_NAMES)[number];

export function clinicAppointmentToolsAllowed(input: {
  industry: BusinessIndustry | string;
  clinicAppointmentToolsEnabled: boolean;
}): boolean {
  return (
    hasClinicAgenda(input.industry) &&
    input.clinicAppointmentToolsEnabled === true
  );
}

/** OpenAI Chat Completions tool definitions. */
export function getClinicAppointmentToolDefinitions() {
  return [
    {
      type: "function" as const,
      function: {
        name: "clinic_list_resources",
        description:
          "Lista profesionales/recursos activos de la clínica para que el paciente elija.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "clinic_get_availability",
        description:
          "Consulta horarios REALES disponibles. Nunca inventes disponibilidad: usa solo el resultado de esta tool. No requiere confirmación del paciente.",
        parameters: {
          type: "object",
          properties: {
            resource_id: {
              type: "string",
              description: "UUID del profesional (clinic_calendar_resources.id).",
            },
            date: {
              type: "string",
              description:
                "Fecha YYYY-MM-DD o expresión relativa (hoy, mañana, lunes, este viernes).",
            },
            time_preference: {
              type: "string",
              enum: ["morning", "afternoon", "evening"],
              description: "Filtro opcional de franja.",
            },
          },
          required: ["resource_id", "date"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "clinic_list_my_appointments",
        description:
          "Lista citas futuras del paciente de esta conversación (para reprogramar/cancelar).",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "clinic_create_appointment",
        description:
          "Crea una cita SOLO si el paciente confirmó explícitamente (sí, confirmo, dale, etc.). Si aún no confirmó, llama con patient_confirmed=false para preparar la confirmación.",
        parameters: {
          type: "object",
          properties: {
            resource_id: { type: "string" },
            service_name: { type: "string" },
            start_at: {
              type: "string",
              description: "ISO start_at exacto de un slot de clinic_get_availability.",
            },
            end_at: {
              type: "string",
              description: "ISO end_at exacto del mismo slot.",
            },
            patient_confirmed: {
              type: "boolean",
              description: "true solo tras confirmación explícita del paciente.",
            },
          },
          required: [
            "resource_id",
            "service_name",
            "start_at",
            "end_at",
            "patient_confirmed",
          ],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "clinic_reschedule_appointment",
        description:
          "Reprograma una cita del paciente. Requiere patient_confirmed=true tras confirmación explícita.",
        parameters: {
          type: "object",
          properties: {
            appointment_id: { type: "string" },
            start_at: { type: "string" },
            end_at: { type: "string" },
            resource_id: { type: "string" },
            patient_confirmed: { type: "boolean" },
          },
          required: ["appointment_id", "start_at", "end_at", "patient_confirmed"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "clinic_cancel_appointment",
        description:
          "Cancela una cita del paciente. Requiere patient_confirmed=true tras confirmación explícita.",
        parameters: {
          type: "object",
          properties: {
            appointment_id: { type: "string" },
            patient_confirmed: { type: "boolean" },
          },
          required: ["appointment_id", "patient_confirmed"],
          additionalProperties: false,
        },
      },
    },
  ];
}

export type ClinicToolExecutionContext = {
  trusted: ClinicTrustedContext;
  industry: string;
  clinicAppointmentToolsEnabled: boolean;
  latestUserMessage: string;
  metadata: AgentConversationMetadata;
  onMetadataChange: (meta: AgentConversationMetadata) => void;
};

export type ClinicToolExecutionResult = {
  tool: ClinicToolName;
  success: boolean;
  error_code?: string;
  duration_ms: number;
  result: unknown;
};

function asRecord(args: string): Record<string, unknown> {
  try {
    return JSON.parse(args) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function setIntent(
  ctx: ClinicToolExecutionContext,
  intent: AppointmentIntentState,
) {
  ctx.onMetadataChange({
    ...ctx.metadata,
    appointment_intent: intent,
  });
}

export async function executeClinicAppointmentTool(
  name: string,
  argsJson: string,
  ctx: ClinicToolExecutionContext,
): Promise<ClinicToolExecutionResult> {
  const started = Date.now();
  const tool = name as ClinicToolName;
  const logBase = {
    business_id: ctx.trusted.businessId,
    contact_id: ctx.trusted.contactId,
    tool: name,
  };

  if (
    !clinicAppointmentToolsAllowed({
      industry: ctx.industry,
      clinicAppointmentToolsEnabled: ctx.clinicAppointmentToolsEnabled,
    })
  ) {
    const result = {
      ok: false,
      code: "TOOLS_DISABLED",
      error: "Las herramientas de agenda no están habilitadas para este negocio.",
    };
    console.info("[ai-agent][clinic-tool]", {
      ...logBase,
      success: false,
      error_code: "TOOLS_DISABLED",
      duration_ms: Date.now() - started,
    });
    return {
      tool,
      success: false,
      error_code: "TOOLS_DISABLED",
      duration_ms: Date.now() - started,
      result,
    };
  }

  const args = asRecord(argsJson);
  let payload: unknown;

  try {
    switch (name) {
      case "clinic_list_resources": {
        const res = await appointmentService.listActiveResourcesTrusted(
          ctx.trusted,
        );
        payload = res.ok
          ? {
              ok: true,
              resources: res.data.map((r) => ({ id: r.id, name: r.name })),
              timezone: ctx.trusted.timezone,
              timezone_label: formatTimezoneLabel(ctx.trusted.timezone),
            }
          : { ok: false, code: res.code, error: res.error };
        break;
      }
      case "clinic_get_availability": {
        const resourceId = String(args.resource_id ?? "");
        const dateRaw = String(args.date ?? "");
        const date =
          resolveRelativeDate(dateRaw, ctx.trusted.timezone) ??
          (/^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : null);
        if (!resourceId) {
          payload = {
            ok: false,
            code: "MISSING_RESOURCE",
            error: "Falta resource_id.",
          };
          break;
        }
        if (!date) {
          payload = {
            ok: false,
            code: "AMBIGUOUS_DATE",
            error:
              "No pude interpretar la fecha. Pide al paciente un día concreto (ej. lunes o 2026-09-28).",
          };
          break;
        }
        const pref = args.time_preference;
        const time_preference =
          pref === "morning" || pref === "afternoon" || pref === "evening"
            ? pref
            : null;
        const res = await appointmentService.getAvailabilityTrusted(ctx.trusted, {
          resource_id: resourceId,
          date,
          time_preference,
        });
        if (!res.ok) {
          payload = { ok: false, code: res.code, error: res.error };
          break;
        }
        setIntent(
          ctx,
          buildAppointmentIntent({
            action: "get_availability",
            resource_id: resourceId,
            resource_name: res.data.resourceName,
            requested_date: date,
            offered_slots: res.data.slots,
            awaiting_confirmation: false,
          }),
        );
        payload = {
          ok: true,
          date,
          resource_name: res.data.resourceName,
          has_weekly_for_day: res.data.hasWeeklyForDay,
          duration_minutes: res.data.durationMinutes,
          timezone: ctx.trusted.timezone,
          slots: res.data.slots,
          message: res.data.hasWeeklyForDay
            ? res.data.slots.length > 0
              ? `Horarios reales disponibles (${formatTimezoneLabel(ctx.trusted.timezone)}).`
              : "No hay horarios libres ese día."
            : `${res.data.resourceName} no tiene disponibilidad configurada para ese día.`,
        };
        break;
      }
      case "clinic_list_my_appointments": {
        const res = await appointmentService.listPatientAppointmentsTrusted(
          ctx.trusted,
        );
        if (!res.ok) {
          payload = { ok: false, code: res.code, error: res.error };
          break;
        }
        payload = {
          ok: true,
          appointments: res.data.map((a) => ({
            id: a.id,
            service_name: a.service_name,
            resource_name: a.resource_name,
            status: a.status,
            when: formatAppointmentRange(
              a.start_at,
              a.end_at,
              ctx.trusted.timezone,
            ),
            start_at: a.start_at,
            end_at: a.end_at,
          })),
        };
        break;
      }
      case "clinic_create_appointment": {
        const patientConfirmed = args.patient_confirmed === true;
        const confirmed =
          patientConfirmed &&
          isAffirmativeConfirmation(ctx.latestUserMessage);
        const resource_id = String(args.resource_id ?? "");
        const service_name = String(args.service_name ?? "");
        const start_at = String(args.start_at ?? "");
        const end_at = String(args.end_at ?? "");

        if (!confirmed) {
          setIntent(
            ctx,
            buildAppointmentIntent({
              action: "create",
              resource_id,
              service_name,
              selected_start_at: start_at,
              selected_end_at: end_at,
              awaiting_confirmation: true,
            }),
          );
          payload = {
            ok: false,
            code: "NEEDS_CONFIRMATION",
            error:
              "Aún no hay confirmación explícita del paciente. Resume la cita (servicio, profesional, fecha/hora) y pregunta si confirma. NO digas que ya está reservada.",
            preview: {
              service_name,
              start_at,
              end_at,
              when: formatAppointmentRange(
                start_at,
                end_at,
                ctx.trusted.timezone,
              ),
            },
          };
          break;
        }

        const res = await appointmentService.createAppointmentTrusted(
          ctx.trusted,
          {
            resource_id,
            service_name,
            start_at,
            end_at,
            source: "whatsapp_ai",
          },
        );
        if (!res.ok) {
          // Offer alternatives on overlap
          let alternatives: unknown = null;
          if (
            res.code === "APPOINTMENT_OVERLAP" ||
            res.code === "OUTSIDE_AVAILABILITY" ||
            res.code === "SCHEDULE_BLOCKED"
          ) {
            const date = start_at
              ? new Intl.DateTimeFormat("en-CA", {
                  timeZone: ctx.trusted.timezone,
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                }).format(new Date(start_at))
              : null;
            if (date && resource_id) {
              const alt = await appointmentService.getAvailabilityTrusted(
                ctx.trusted,
                { resource_id, date },
              );
              if (alt.ok) alternatives = alt.data.slots.slice(0, 6);
            }
          }
          payload = {
            ok: false,
            code: res.code,
            error: res.error,
            alternatives,
          };
          break;
        }
        ctx.onMetadataChange(clearAppointmentIntent(ctx.metadata));
        payload = {
          ok: true,
          appointment_id: res.data.id,
          source: res.data.source,
          when: formatAppointmentRange(
            res.data.start_at,
            res.data.end_at,
            ctx.trusted.timezone,
          ),
          service_name: res.data.service_name,
          message:
            "Cita creada correctamente. Confírmaselo al paciente en lenguaje natural. NO menciones IDs ni UTC.",
        };
        break;
      }
      case "clinic_reschedule_appointment": {
        const patientConfirmed = args.patient_confirmed === true;
        const confirmed =
          patientConfirmed &&
          isAffirmativeConfirmation(ctx.latestUserMessage);
        const appointment_id = String(args.appointment_id ?? "");
        const start_at = String(args.start_at ?? "");
        const end_at = String(args.end_at ?? "");
        const resource_id = args.resource_id
          ? String(args.resource_id)
          : undefined;

        if (!confirmed) {
          setIntent(
            ctx,
            buildAppointmentIntent({
              action: "reschedule",
              appointment_id,
              selected_start_at: start_at,
              selected_end_at: end_at,
              resource_id,
              awaiting_confirmation: true,
            }),
          );
          payload = {
            ok: false,
            code: "NEEDS_CONFIRMATION",
            error:
              "Pide confirmación explícita antes de reprogramar. NO digas que ya se cambió.",
            preview: {
              appointment_id,
              when: formatAppointmentRange(
                start_at,
                end_at,
                ctx.trusted.timezone,
              ),
            },
          };
          break;
        }

        const res = await appointmentService.rescheduleAppointmentTrusted(
          ctx.trusted,
          { appointment_id, start_at, end_at, resource_id },
        );
        if (!res.ok) {
          payload = { ok: false, code: res.code, error: res.error };
          break;
        }
        ctx.onMetadataChange(clearAppointmentIntent(ctx.metadata));
        payload = {
          ok: true,
          when: formatAppointmentRange(
            res.data.start_at,
            res.data.end_at,
            ctx.trusted.timezone,
          ),
          message: "Cita reprogramada. Confírmaselo al paciente sin IDs técnicos.",
        };
        break;
      }
      case "clinic_cancel_appointment": {
        const patientConfirmed = args.patient_confirmed === true;
        const confirmed =
          patientConfirmed &&
          isAffirmativeConfirmation(ctx.latestUserMessage);
        const appointment_id = String(args.appointment_id ?? "");

        if (!confirmed) {
          setIntent(
            ctx,
            buildAppointmentIntent({
              action: "cancel",
              appointment_id,
              awaiting_confirmation: true,
            }),
          );
          payload = {
            ok: false,
            code: "NEEDS_CONFIRMATION",
            error:
              "Pide confirmación explícita antes de cancelar. NO canceles por dudas ('quizás', 'puede que').",
          };
          break;
        }

        const res = await appointmentService.cancelAppointmentTrusted(
          ctx.trusted,
          appointment_id,
        );
        if (!res.ok) {
          payload = { ok: false, code: res.code, error: res.error };
          break;
        }
        ctx.onMetadataChange(clearAppointmentIntent(ctx.metadata));
        payload = {
          ok: true,
          message: "Cita cancelada correctamente. Informa al paciente.",
        };
        break;
      }
      default:
        payload = {
          ok: false,
          code: "UNKNOWN_TOOL",
          error: `Tool desconocida: ${name}`,
        };
    }
  } catch (err) {
    payload = {
      ok: false,
      code: "GENERIC",
      error: err instanceof Error ? err.message : "Error interno de tool.",
    };
  }

  const success =
    typeof payload === "object" &&
    payload !== null &&
    "ok" in payload &&
    (payload as { ok: boolean }).ok === true;
  const error_code =
    typeof payload === "object" &&
    payload !== null &&
    "code" in payload &&
    typeof (payload as { code?: unknown }).code === "string"
      ? (payload as { code: string }).code
      : undefined;

  console.info("[ai-agent][clinic-tool]", {
    ...logBase,
    success,
    error_code: error_code ?? null,
    duration_ms: Date.now() - started,
  });

  return {
    tool,
    success,
    error_code,
    duration_ms: Date.now() - started,
    result: payload,
  };
}
