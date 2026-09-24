import {
  clearAppointmentIntent,
  mergeAppointmentIntent,
  type AgentConversationMetadata,
  type AppointmentIntentState,
} from "@/lib/ai/appointment-intent";
import {
  isAffirmativeConfirmation,
  isNegativeOrChangeIntent,
} from "@/lib/ai/confirmation";
import {
  resolveOfferedSlotSelection,
  type OfferedSlot,
} from "@/lib/ai/offered-slot-selection";
import { formatAppointmentRange } from "@/lib/clinic/timezone-display";
import * as appointmentService from "@/services/clinic/appointment.service";
import type { ClinicTrustedContext } from "@/services/clinic/appointment.service";

export type ClinicBookingTurnEvent =
  | {
      type: "slot_selected";
      slot: OfferedSlot;
      intent: AppointmentIntentState;
    }
  | {
      type: "slot_not_offered";
      requested: string;
      offered_slots: OfferedSlot[];
    }
  | {
      type: "slot_ambiguous";
      candidates: OfferedSlot[];
    }
  | {
      type: "confirmation_pending";
      intent: AppointmentIntentState;
    }
  | {
      type: "created";
      appointment_id: string;
      when: string;
      service_name: string;
    }
  | {
      type: "slot_unavailable";
      alternatives: OfferedSlot[];
      code: string;
      error: string;
    }
  | {
      type: "confirmation_declined";
      intent: AppointmentIntentState;
    }
  | {
      type: "cannot_confirm_missing_slot";
    }
  | { type: "none" };

export type ClinicBookingTurnResult = {
  metadata: AgentConversationMetadata;
  event: ClinicBookingTurnEvent;
  /** Instrucción obligatoria para el system prompt de este turno. */
  systemNote: string;
  /** Tools ejecutadas server-side (create) para el harness trace. */
  serverToolTrace: Array<{
    name: string;
    arguments: Record<string, unknown>;
    result: unknown;
  }>;
};

function intentOrEmpty(
  meta: AgentConversationMetadata,
): AppointmentIntentState | undefined {
  return meta.appointment_intent;
}

/**
 * Avanza el estado de reserva de forma determinista ANTES del LLM.
 * - Selección de horario contra offered_slots
 * - Confirmación / rechazo
 * - Create solo tras Sí + slot persistido + revalidación real
 */
export async function advanceClinicBookingTurn(input: {
  message: string;
  metadata: AgentConversationMetadata;
  trusted: ClinicTrustedContext;
}): Promise<ClinicBookingTurnResult> {
  let metadata = input.metadata;
  const intent = intentOrEmpty(metadata);
  const serverToolTrace: ClinicBookingTurnResult["serverToolTrace"] = [];
  const message = input.message.trim();

  // --- Confirmación afirmativa ---
  if (intent?.awaiting_confirmation && isAffirmativeConfirmation(message)) {
    if (!intent.selected_start_at || !intent.selected_end_at) {
      return {
        metadata,
        event: { type: "cannot_confirm_missing_slot" },
        systemNote:
          "El paciente confirmó pero no hay selected_start_at/end_at persistidos. NO crees la cita. Pide que elija de nuevo un horario de la lista ofrecida.",
        serverToolTrace,
      };
    }
    if (!intent.resource_id || !intent.service_id || !intent.service_name) {
      return {
        metadata,
        event: { type: "cannot_confirm_missing_slot" },
        systemNote:
          "Faltan resource_id, service_id o service_name en appointment_intent. NO crees la cita. Pide aclarar profesional/servicio reservable (clinic_services).",
        serverToolTrace,
      };
    }

    const createArgs = {
      resource_id: intent.resource_id,
      service_id: intent.service_id,
      service_name: intent.service_name,
      start_at: intent.selected_start_at,
      end_at: intent.selected_end_at,
      source: "whatsapp_ai" as const,
    };

    const res = await appointmentService.createAppointmentTrusted(
      input.trusted,
      createArgs,
    );

    if (!res.ok) {
      let alternatives: OfferedSlot[] = [];
      if (
        res.code === "APPOINTMENT_OVERLAP" ||
        res.code === "OUTSIDE_AVAILABILITY" ||
        res.code === "SCHEDULE_BLOCKED"
      ) {
        const date =
          intent.requested_date ??
          new Intl.DateTimeFormat("en-CA", {
            timeZone: input.trusted.timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date(intent.selected_start_at));
        const alt = await appointmentService.getAvailabilityTrusted(
          input.trusted,
          {
            resource_id: intent.resource_id,
            date,
            service_id: intent.service_id,
          },
        );
        if (alt.ok) {
          alternatives = alt.data.slots.slice(0, 8);
          metadata = {
            ...metadata,
            appointment_intent: mergeAppointmentIntent(intent, {
              action: "get_availability",
              awaiting_confirmation: false,
              selected_start_at: undefined,
              selected_end_at: undefined,
              offered_slots: alternatives,
              requested_date: date,
            }),
          };
        }
      }

      serverToolTrace.push({
        name: "clinic_create_appointment",
        arguments: { ...createArgs, patient_confirmed: true },
        result: { ok: false, code: res.code, error: res.error, alternatives },
      });

      return {
        metadata,
        event: {
          type: "slot_unavailable",
          alternatives,
          code: res.code,
          error: res.error,
        },
        systemNote: `El paciente confirmó pero el horario ya no está disponible (${res.code}). NO digas que quedó reservada. Ofrece alternativas reales: ${alternatives.map((s) => s.display_time).join(", ") || "(sin alternativas)"}.`,
        serverToolTrace,
      };
    }

    metadata = clearAppointmentIntent(metadata);
    const when = formatAppointmentRange(
      res.data.start_at,
      res.data.end_at,
      input.trusted.timezone,
    );
    serverToolTrace.push({
      name: "clinic_create_appointment",
      arguments: { ...createArgs, patient_confirmed: true },
      result: {
        ok: true,
        appointment_id: res.data.id,
        when,
        service_name: res.data.service_name,
      },
    });

    return {
      metadata,
      event: {
        type: "created",
        appointment_id: res.data.id,
        when,
        service_name: res.data.service_name,
      },
      systemNote: `Cita CREADA correctamente (${when}, ${res.data.service_name}). Confírmaselo al paciente en lenguaje natural. NO menciones IDs ni UTC. No vuelvas a pedir confirmación.`,
      serverToolTrace,
    };
  }

  // --- Rechazo / cambio de hora mientras espera confirmación ---
  if (intent?.awaiting_confirmation && isNegativeOrChangeIntent(message)) {
    // ¿Eligió otro offered_slot? ("mejor 11:00")
    const swap = resolveOfferedSlotSelection(message, intent.offered_slots);
    if (swap.status === "selected") {
      const next = mergeAppointmentIntent(intent, {
        action: "create",
        selected_start_at: swap.slot.start_at,
        selected_end_at: swap.slot.end_at,
        awaiting_confirmation: true,
      });
      metadata = { ...metadata, appointment_intent: next };
      return {
        metadata,
        event: { type: "slot_selected", slot: swap.slot, intent: next },
        systemNote: `El paciente cambió al horario ${swap.slot.display_time}. appointment_intent.awaiting_confirmation=true. Resume la cita y pide confirmación explícita. NO crees todavía.`,
        serverToolTrace,
      };
    }

    const next = mergeAppointmentIntent(intent, {
      action: "get_availability",
      awaiting_confirmation: false,
      selected_start_at: undefined,
      selected_end_at: undefined,
    });
    metadata = { ...metadata, appointment_intent: next };
    return {
      metadata,
      event: { type: "confirmation_declined", intent: next },
      systemNote:
        "El paciente NO confirmó. NO crees la cita. Ofrece de nuevo horarios de offered_slots o pregunta qué prefiere.",
      serverToolTrace,
    };
  }

  // --- Selección de slot desde offered_slots ---
  if (intent?.offered_slots && intent.offered_slots.length > 0) {
    const selection = resolveOfferedSlotSelection(message, intent.offered_slots);
    if (selection.status === "selected") {
      const next = mergeAppointmentIntent(intent, {
        action: "create",
        selected_start_at: selection.slot.start_at,
        selected_end_at: selection.slot.end_at,
        awaiting_confirmation: true,
      });
      metadata = { ...metadata, appointment_intent: next };
      return {
        metadata,
        event: {
          type: "slot_selected",
          slot: selection.slot,
          intent: next,
        },
        systemNote: `El paciente seleccionó ${selection.slot.display_time}. Estado YA persistido: awaiting_confirmation=true, selected_start_at/end_at del offered_slot. Pregunta confirmación explícita (sí/confirmo). NO llames clinic_create_appointment todavía. NO inventes start_at/end_at.`,
        serverToolTrace,
      };
    }
    if (selection.status === "not_in_offered") {
      return {
        metadata,
        event: {
          type: "slot_not_offered",
          requested: selection.requested,
          offered_slots: intent.offered_slots,
        },
        systemNote: `El horario "${selection.requested}" NO está en offered_slots. NO lo persistas. Indica que no está disponible y vuelve a ofrecer: ${intent.offered_slots.map((s) => s.display_time).join(", ")}.`,
        serverToolTrace,
      };
    }
    if (selection.status === "ambiguous") {
      return {
        metadata,
        event: {
          type: "slot_ambiguous",
          candidates: selection.candidates,
        },
        systemNote: `Horario ambiguo. Pregunta cuál de estos: ${selection.candidates.map((s) => s.display_time).join(", ")}.`,
        serverToolTrace,
      };
    }
  }

  if (intent?.awaiting_confirmation) {
    return {
      metadata,
      event: { type: "confirmation_pending", intent },
      systemNote:
        "Seguimos awaiting_confirmation=true con slot ya seleccionado. Si el paciente no confirma claramente, no crees. Resume y pregunta confirmación.",
      serverToolTrace,
    };
  }

  return {
    metadata,
    event: { type: "none" },
    systemNote: "",
    serverToolTrace,
  };
}
