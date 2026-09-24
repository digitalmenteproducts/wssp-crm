export type AppointmentIntentAction =
  | "none"
  | "get_availability"
  | "create"
  | "reschedule"
  | "cancel";

export type AppointmentIntentState = {
  action: AppointmentIntentAction;
  resource_id?: string;
  resource_name?: string;
  service_name?: string;
  requested_date?: string;
  selected_start_at?: string;
  selected_end_at?: string;
  appointment_id?: string;
  awaiting_confirmation?: boolean;
  offered_slots?: Array<{ start_at: string; end_at: string; display_time: string }>;
  updated_at?: string;
};

export type AgentConversationMetadata = {
  appointment_intent?: AppointmentIntentState;
};

export function parseAgentMetadata(
  raw: unknown,
): AgentConversationMetadata {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const intent = obj.appointment_intent;
  if (!intent || typeof intent !== "object") return {};
  return { appointment_intent: intent as AppointmentIntentState };
}

export function buildAppointmentIntent(
  patch: Partial<AppointmentIntentState> & { action: AppointmentIntentAction },
): AppointmentIntentState {
  return {
    ...patch,
    updated_at: new Date().toISOString(),
  };
}

export function clearAppointmentIntent(
  meta: AgentConversationMetadata,
): AgentConversationMetadata {
  const next = { ...meta };
  delete next.appointment_intent;
  return next;
}
