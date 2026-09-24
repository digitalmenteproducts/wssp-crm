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
  service_id?: string;
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
  const next: AppointmentIntentState = {
    ...patch,
    updated_at: new Date().toISOString(),
  };
  // Allow explicit clear via undefined in patch
  for (const key of Object.keys(next) as Array<keyof AppointmentIntentState>) {
    if (next[key] === undefined) {
      delete next[key];
    }
  }
  return next;
}

/** Merge patch over previous intent (preserves service_name, resource, etc.). */
export function mergeAppointmentIntent(
  previous: AppointmentIntentState | undefined,
  patch: Partial<AppointmentIntentState> & { action: AppointmentIntentAction },
): AppointmentIntentState {
  const merged: Record<string, unknown> = {
    ...(previous ?? {}),
    ...patch,
    updated_at: new Date().toISOString(),
  };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete merged[key];
    }
  }
  return merged as AppointmentIntentState;
}

export function clearAppointmentIntent(
  meta: AgentConversationMetadata,
): AgentConversationMetadata {
  const next = { ...meta };
  delete next.appointment_intent;
  return next;
}
