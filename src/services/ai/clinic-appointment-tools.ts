import {
  clearAppointmentIntent,
  mergeAppointmentIntent,
  type AgentConversationMetadata,
  type AppointmentIntentState,
} from "@/lib/ai/appointment-intent";
import { isAffirmativeConfirmation } from "@/lib/ai/confirmation";
import { resolveAppointmentDateInput } from "@/lib/ai/relative-dates";
import {
  type ClinicServiceCatalogItem,
  isKnownClinicServiceId,
} from "@/lib/ai/resolve-clinic-service";
import {
  resolveResourceIdFromArgs,
  slotMatchesOffered,
} from "@/lib/ai/offered-slot-selection";
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
          "Consulta horarios REALES disponibles. Nunca inventes disponibilidad ni YYYY-MM-DD. Para fechas relativas (hoy, mañana, el próximo lunes) SIEMPRE pasa date_expression con las palabras del paciente; el backend las resuelve con business.timezone. Solo usa date (YYYY-MM-DD) si el paciente dio una fecha absoluta explícita. No requiere confirmación del paciente.",
        parameters: {
          type: "object",
          properties: {
            resource_id: {
              type: "string",
              description: "UUID del profesional (clinic_calendar_resources.id).",
            },
            date_expression: {
              type: "string",
              description:
                "Frase temporal del paciente sin convertir a calendario (ej. 'el próximo lunes', 'mañana', 'este viernes'). Preferido para relativos.",
            },
            date: {
              type: "string",
              description:
                "Solo YYYY-MM-DD si el paciente indicó una fecha absoluta. NUNCA inventes el año ni conviertas 'próximo lunes' a YYYY-MM-DD.",
            },
            time_preference: {
              type: "string",
              enum: ["morning", "afternoon", "evening"],
              description: "Filtro opcional de franja.",
            },
            service_id: {
              type: "string",
              description:
                "UUID del servicio en clinic_services. Reutiliza appointment_intent.service_id si ya está resuelto.",
            },
          },
          required: ["resource_id"],
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
            service_id: {
              type: "string",
              description:
                "UUID del servicio reservable en clinic_services (obligatorio). Debe coincidir con el catálogo; reutiliza appointment_intent.service_id.",
            },
            service_name: {
              type: "string",
              description:
                "Nombre del servicio (opcional si service_id ya está en appointment_intent). Debe coincidir con el catálogo.",
            },
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
            "service_id",
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
  /** Servicios activos de clinic_services (fuente de verdad para reservar). */
  serviceCatalog: ClinicServiceCatalogItem[];
  /** Injectable for deterministic tests; defaults to real now. */
  now?: Date;
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

function findCatalogItemByIdOrName(
  catalog: ClinicServiceCatalogItem[],
  serviceId: string | null,
  serviceName: string | null,
): ClinicServiceCatalogItem | null {
  if (serviceId) {
    const byId = catalog.find((c) => c.id === serviceId && c.active);
    if (byId) return byId;
  }
  const name = serviceName?.trim();
  if (!name) return null;
  return (
    catalog.find(
      (c) =>
        c.active &&
        (c.name.localeCompare(name, "es", { sensitivity: "accent" }) === 0 ||
          c.name.toLowerCase() === name.toLowerCase()),
    ) ?? null
  );
}

function resolveBookableServiceForTool(input: {
  argServiceId: string | null;
  argServiceName: string | null;
  intent: AppointmentIntentState | undefined;
  catalog: ClinicServiceCatalogItem[];
}):
  | { ok: true; service_id: string; service_name: string }
  | {
      ok: false;
      code: string;
      error: string;
      catalog?: ClinicServiceCatalogItem[];
    } {
  const intentId = input.intent?.service_id?.trim() ?? null;
  const intentName = input.intent?.service_name?.trim() ?? null;
  const rawId = input.argServiceId?.trim() || intentId;
  const rawName = input.argServiceName?.trim() || intentName;

  if (rawId && !isKnownClinicServiceId(rawId, input.catalog)) {
    const inactive = input.catalog.find((c) => c.id === rawId);
    if (inactive && !inactive.active) {
      return {
        ok: false,
        code: "SERVICE_INACTIVE",
        error: "El servicio no está activo para reservas.",
      };
    }
    return {
      ok: false,
      code: "SERVICE_NOT_FOUND",
      error:
        "service_id no está en clinic_services. NO inventes UUIDs. Usa un id del catálogo o pide aclarar el tratamiento.",
      catalog: input.catalog.filter((c) => c.active),
    };
  }

  const item =
    (rawId ? input.catalog.find((c) => c.id === rawId && c.active) : null) ??
    findCatalogItemByIdOrName(input.catalog, null, rawName);

  if (!item) {
    return {
      ok: false,
      code: "SERVICE_NOT_FOUND",
      error:
        "Falta service_id válido de clinic_services. NO inventes servicios. Ofrece consulta de valoración si aplica.",
      catalog: input.catalog.filter((c) => c.active),
    };
  }

  if (item.requires_initial_consultation) {
    return {
      ok: false,
      code: "SERVICE_REQUIRES_CONSULTATION",
      error: `El servicio "${item.name}" requiere consulta de valoración previa. Reserva la consulta inicial (service_id de valoración), no este tratamiento.`,
    };
  }

  return { ok: true, service_id: item.id, service_name: item.name };
}

function setIntent(
  ctx: ClinicToolExecutionContext,
  patch: Partial<AppointmentIntentState> & {
    action: AppointmentIntentState["action"];
  },
) {
  const prev = ctx.metadata.appointment_intent;
  ctx.onMetadataChange({
    ...ctx.metadata,
    appointment_intent: mergeAppointmentIntent(prev, patch),
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
        const intentServiceId = ctx.metadata.appointment_intent?.service_id;
        const res =
          intentServiceId && isKnownClinicServiceId(intentServiceId, ctx.serviceCatalog)
            ? await appointmentService.listCompatibleResourcesTrusted(
                ctx.trusted,
                intentServiceId,
              )
            : await appointmentService.listActiveResourcesTrusted(ctx.trusted);
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
        const resourceResolved = resolveResourceIdFromArgs({
          argResourceId:
            typeof args.resource_id === "string" ? args.resource_id : null,
          intent: ctx.metadata.appointment_intent,
        });
        const dateExpression =
          typeof args.date_expression === "string"
            ? args.date_expression
            : null;
        const dateArg = typeof args.date === "string" ? args.date : null;

        if (!resourceResolved.ok) {
          payload = {
            ok: false,
            code: resourceResolved.code,
            error: resourceResolved.error,
          };
          break;
        }
        const resourceId = resourceResolved.resource_id;

        const resolved = resolveAppointmentDateInput({
          date: dateArg,
          date_expression: dateExpression,
          latestUserMessage: ctx.latestUserMessage,
          timeZone: ctx.trusted.timezone,
          now: ctx.now,
        });

        if (!resolved.ok) {
          payload = {
            ok: false,
            code: resolved.code,
            error: resolved.error,
          };
          break;
        }

        const date = resolved.date;
        const pref = args.time_preference;
        const time_preference =
          pref === "morning" || pref === "afternoon" || pref === "evening"
            ? pref
            : null;

        const serviceResolved = resolveBookableServiceForTool({
          argServiceId:
            typeof args.service_id === "string" ? args.service_id : null,
          argServiceName: null,
          intent: ctx.metadata.appointment_intent,
          catalog: ctx.serviceCatalog,
        });
        if (!serviceResolved.ok) {
          payload = {
            ok: false,
            code: serviceResolved.code,
            error: serviceResolved.error,
            ...(serviceResolved.catalog
              ? { catalog: serviceResolved.catalog }
              : {}),
          };
          break;
        }

        const res = await appointmentService.getAvailabilityTrusted(ctx.trusted, {
          resource_id: resourceId,
          date,
          time_preference,
          service_id: serviceResolved.service_id,
        });
        if (!res.ok) {
          payload = { ok: false, code: res.code, error: res.error };
          break;
        }
        setIntent(ctx, {
          action: "get_availability",
          resource_id: resourceId,
          resource_name: res.data.resourceName,
          service_id: serviceResolved.service_id,
          service_name: serviceResolved.service_name,
          requested_date: date,
          offered_slots: res.data.slots,
          awaiting_confirmation: false,
          selected_start_at: undefined,
          selected_end_at: undefined,
        });
        payload = {
          ok: true,
          date,
          date_source: resolved.source,
          date_expression_used: resolved.expression,
          resource_id: resourceId,
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
        const intent = ctx.metadata.appointment_intent;

        const resourceResolved = resolveResourceIdFromArgs({
          argResourceId:
            typeof args.resource_id === "string" ? args.resource_id : null,
          intent,
        });
        if (!resourceResolved.ok) {
          payload = {
            ok: false,
            code: resourceResolved.code,
            error: resourceResolved.error,
          };
          break;
        }
        const resource_id = resourceResolved.resource_id;

        // start/end: SOLO from persisted offered slot or args that match offered_slots.
        const intentStart = intent?.selected_start_at?.trim() ?? "";
        const intentEnd = intent?.selected_end_at?.trim() ?? "";
        const argStart = String(args.start_at ?? "").trim();
        const argEnd = String(args.end_at ?? "").trim();

        const start_at = intentStart || argStart;
        const end_at = intentEnd || argEnd;

        if (intent?.offered_slots?.length) {
          if (!slotMatchesOffered(start_at, end_at, intent.offered_slots)) {
            // Prefer exact match from args display if args don't match — reject inventados.
            payload = {
              ok: false,
              code: "SLOT_NOT_OFFERED",
              error:
                "start_at/end_at deben coincidir exactamente con un offered_slot previo. NO inventes horarios. Usa selected_start_at/end_at del appointment_intent o un slot de la lista.",
              offered_slots: intent.offered_slots,
            };
            break;
          }
        } else if (!start_at || !end_at) {
          payload = {
            ok: false,
            code: "MISSING_SLOT",
            error: "Faltan start_at/end_at y no hay slot seleccionado en appointment_intent.",
          };
          break;
        }

        const serviceResolved = resolveBookableServiceForTool({
          argServiceId:
            typeof args.service_id === "string" ? args.service_id : null,
          argServiceName:
            typeof args.service_name === "string" ? args.service_name : null,
          intent,
          catalog: ctx.serviceCatalog,
        });
        if (!serviceResolved.ok) {
          payload = {
            ok: false,
            code: serviceResolved.code,
            error: serviceResolved.error,
            ...(serviceResolved.catalog
              ? { catalog: serviceResolved.catalog }
              : {}),
          };
          break;
        }
        const { service_id, service_name } = serviceResolved;

        if (!confirmed) {
          setIntent(ctx, {
            action: "create",
            resource_id,
            service_id,
            service_name,
            selected_start_at: start_at,
            selected_end_at: end_at,
            awaiting_confirmation: true,
          });
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
            service_id,
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
                { resource_id, date, service_id },
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
          setIntent(ctx, {
            action: "reschedule",
            appointment_id,
            selected_start_at: start_at,
            selected_end_at: end_at,
            resource_id,
            awaiting_confirmation: true,
          });
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
          setIntent(ctx, {
            action: "cancel",
            appointment_id,
            awaiting_confirmation: true,
          });
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
