import { createAdminClient } from "@/lib/supabase/admin";
import {
  deleteKnowledgeEntrySchema,
  testAiAgentSchema,
  updateAiAgentSettingsSchema,
  upsertKnowledgeEntrySchema,
  type TestAiAgentInput,
  type UpdateAiAgentSettingsInput,
  type UpsertKnowledgeEntryInput,
} from "@/schemas/ai-agent";
import * as aiAgentRepository from "@/repositories/ai-agent.repository";
import * as whatsappRepository from "@/repositories/whatsapp.repository";
import * as businessService from "@/services/business/business.service";
import { buildAgentSystemPrompt } from "@/lib/ai/agent-prompt";
import {
  formatKnowledgeForPrompt,
  normalizeText,
  rankKnowledgeEntriesDetailed,
  reconcileAgentConfidence,
  shouldForceHandoff,
  softenLowRiskHandoff,
} from "@/lib/ai/knowledge-retrieval";
import {
  estimateOpenAiCostUsd,
  generateAgentReplyWithOpenAI,
  generateAgentReplyWithTools,
  getAgentModel,
  getCentralOpenAiApiKey,
} from "@/services/openai/agent-reply.service";
import {
  clinicAppointmentToolsAllowed,
  executeClinicAppointmentTool,
  getClinicAppointmentToolDefinitions,
} from "@/services/ai/clinic-appointment-tools";
import {
  mergeAppointmentIntent,
  parseAgentMetadata,
  type AgentConversationMetadata,
} from "@/lib/ai/appointment-intent";
import { advanceClinicBookingTurn } from "@/lib/ai/clinic-booking-turn";
import {
  formatClinicServiceCatalogForPrompt,
  resolveClinicService,
  toClinicServiceCatalog,
  type ClinicServiceCatalogItem,
  type ClinicServiceResolveResult,
} from "@/lib/ai/resolve-clinic-service";
import * as appointmentService from "@/services/clinic/appointment.service";
import { sendWhatsAppTextMessage } from "@/services/whatsapp/send-text.service";
import type {
  AiAgentReplyResult,
  AiAgentSettings,
  AiKnowledgeEntry,
} from "@/types/ai-agent";
import type { BusinessIndustry } from "@/types/business";
import type { ClinicService } from "@/types/clinic";

const CONTEXT_MESSAGE_LIMIT = 16;

export type AgentToolTraceItem = {
  name: string;
  arguments: string;
  result: unknown;
};

function formatZodIssues(error: { issues: { message: string }[] }): string {
  return error.issues.map((issue) => issue.message).join(" ");
}

function defaultSettings(businessId: string, businessName: string): AiAgentSettings {
  const now = new Date().toISOString();
  return {
    id: "draft",
    business_id: businessId,
    enabled: false,
    agent_name: "Asistente",
    business_name: businessName,
    business_description: "",
    system_instructions: "",
    tone: "profesional",
    custom_tone_instructions: "",
    language: "auto",
    response_length: "breve",
    human_handoff_enabled: true,
    human_handoff_instructions:
      "Transfiere si el cliente pide una persona, si hay un reclamo/devolución compleja, o si no hay información suficiente en la base de conocimiento.",
    max_failed_attempts: 2,
    clinic_appointment_tools_enabled: false,
    created_at: now,
    updated_at: now,
  };
}

async function requireAdminWorkspace(): Promise<
  | {
      ok: true;
      businessId: string;
      businessName: string;
      role: string;
    }
  | { ok: false; error: string }
> {
  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return {
      ok: false,
      error: workspace.ok ? "Sin empresa activa." : workspace.error,
    };
  }

  const role = workspace.workspace.membership.role;
  if (role !== "owner" && role !== "admin") {
    return { ok: false, error: "Solo owner/admin pueden gestionar el Agente IA." };
  }

  return {
    ok: true,
    businessId: workspace.workspace.business.id,
    businessName: workspace.workspace.business.name,
    role,
  };
}

export async function getAiAgentPageData(): Promise<
  | {
      ok: true;
      settings: AiAgentSettings;
      knowledge: AiKnowledgeEntry[];
      openAiConfigured: boolean;
    }
  | { ok: false; error: string }
> {
  const gate = await requireAdminWorkspace();
  if (!gate.ok) {
    // Members can still view settings read-only via member RLS — try member path
    const workspace = await businessService.getCurrentWorkspace();
    if (!workspace.ok || !workspace.workspace) {
      return { ok: false, error: gate.error };
    }
    const businessId = workspace.workspace.business.id;
    const { data, error } = await aiAgentRepository.getAiAgentSettings(businessId);
    if (error) return { ok: false, error: error.message };
    const knowledge = await aiAgentRepository.listKnowledgeEntries(businessId);
    if (knowledge.error) return { ok: false, error: knowledge.error.message };

    return {
      ok: true,
      settings:
        data ??
        defaultSettings(businessId, workspace.workspace.business.name),
      knowledge: knowledge.data ?? [],
      openAiConfigured: Boolean(getCentralOpenAiApiKey()),
    };
  }

  const { data, error } = await aiAgentRepository.getAiAgentSettings(
    gate.businessId,
  );
  if (error) return { ok: false, error: error.message };

  const knowledge = await aiAgentRepository.listKnowledgeEntries(gate.businessId);
  if (knowledge.error) return { ok: false, error: knowledge.error.message };

  return {
    ok: true,
    settings: data ?? defaultSettings(gate.businessId, gate.businessName),
    knowledge: knowledge.data ?? [],
    openAiConfigured: Boolean(getCentralOpenAiApiKey()),
  };
}

export async function saveAiAgentSettingsForCurrentBusiness(
  input: UpdateAiAgentSettingsInput,
): Promise<
  | { ok: true; settings: AiAgentSettings; message: string }
  | { ok: false; error: string }
> {
  const parsed = updateAiAgentSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: formatZodIssues(parsed.error) };
  }

  const gate = await requireAdminWorkspace();
  if (!gate.ok) return gate;

  const { data, error } = await aiAgentRepository.upsertAiAgentSettings(
    gate.businessId,
    {
      enabled: parsed.data.enabled,
      agent_name: parsed.data.agent_name.trim(),
      business_name: parsed.data.business_name.trim(),
      business_description: parsed.data.business_description.trim(),
      system_instructions: parsed.data.system_instructions.trim(),
      tone: parsed.data.tone,
      custom_tone_instructions: parsed.data.custom_tone_instructions.trim(),
      language: parsed.data.language,
      response_length: parsed.data.response_length,
      human_handoff_enabled: parsed.data.human_handoff_enabled,
      human_handoff_instructions: parsed.data.human_handoff_instructions.trim(),
      max_failed_attempts: parsed.data.max_failed_attempts,
      clinic_appointment_tools_enabled:
        parsed.data.clinic_appointment_tools_enabled,
    },
  );

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "No se pudo guardar la configuración.",
    };
  }

  return {
    ok: true,
    settings: data,
    message: data.enabled
      ? "Agente IA guardado y activo."
      : "Agente IA guardado (pausado).",
  };
}

export async function upsertKnowledgeForCurrentBusiness(
  input: UpsertKnowledgeEntryInput,
): Promise<
  | { ok: true; entry: AiKnowledgeEntry; message: string }
  | { ok: false; error: string }
> {
  const parsed = upsertKnowledgeEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: formatZodIssues(parsed.error) };
  }

  const gate = await requireAdminWorkspace();
  if (!gate.ok) return gate;

  const { data, error } = await aiAgentRepository.upsertKnowledgeEntry(
    gate.businessId,
    {
      id: parsed.data.id,
      title: parsed.data.title.trim(),
      content: parsed.data.content.trim(),
      category: parsed.data.category,
      enabled: parsed.data.enabled,
    },
  );

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "No se pudo guardar la entrada.",
    };
  }

  return {
    ok: true,
    entry: data,
    message: parsed.data.id ? "Entrada actualizada." : "Entrada creada.",
  };
}

export async function deleteKnowledgeForCurrentBusiness(
  id: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const parsed = deleteKnowledgeEntrySchema.safeParse({ id });
  if (!parsed.success) {
    return { ok: false, error: formatZodIssues(parsed.error) };
  }

  const gate = await requireAdminWorkspace();
  if (!gate.ok) return gate;

  const { error } = await aiAgentRepository.deleteKnowledgeEntry(
    gate.businessId,
    parsed.data.id,
  );
  if (error) return { ok: false, error: error.message };

  return { ok: true, message: "Entrada eliminada." };
}

async function loadBusinessContext(businessId: string): Promise<{
  industry: BusinessIndustry | string;
  timezone: string;
  name: string;
} | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("businesses")
    .select("industry, timezone, name")
    .eq("id", businessId)
    .maybeSingle<{
      industry: string | null;
      timezone: string;
      name: string;
    }>();
  if (!data) return null;
  return {
    industry: data.industry ?? "other",
    timezone: data.timezone || "UTC",
    name: data.name,
  };
}

function normalizeSettings(settings: AiAgentSettings): AiAgentSettings {
  return {
    ...settings,
    clinic_appointment_tools_enabled: Boolean(
      settings.clinic_appointment_tools_enabled,
    ),
  };
}

async function runAgentGeneration(input: {
  businessId: string;
  settings: AiAgentSettings;
  userMessage: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  conversationId?: string | null;
  sourceMessageId?: string | null;
  contactId?: string | null;
  agentMetadata?: Record<string, unknown> | null;
}): Promise<
  | {
      ok: true;
      result: AiAgentReplyResult;
      model: string;
      toolTrace: AgentToolTraceItem[];
      agentMetadata: AgentConversationMetadata;
      serviceResolution: ClinicServiceResolveResult | null;
      serviceCatalog: ClinicServiceCatalogItem[];
    }
  | { ok: false; error: string }
> {
  const apiKey = getCentralOpenAiApiKey();
  if (!apiKey) {
    return {
      ok: false,
      error: "Falta OPENAI_API_KEY en el servidor.",
    };
  }

  const settings = normalizeSettings(input.settings);
  const businessCtx = await loadBusinessContext(input.businessId);
  if (!businessCtx) {
    return { ok: false, error: "Empresa no encontrada." };
  }

  const { data: knowledgeRows } =
    await aiAgentRepository.listKnowledgeEntriesAdmin(input.businessId, {
      enabledOnly: true,
      limit: 80,
    });

  const rankedDetailed = rankKnowledgeEntriesDetailed(
    knowledgeRows ?? [],
    input.userMessage,
    5,
  );
  let ranked = rankedDetailed.map((item) => item.entry);

  if (ranked.length === 0 && (knowledgeRows?.length ?? 0) > 0) {
    const preferred = (knowledgeRows ?? []).filter((entry) => {
      const title = normalizeText(entry.title);
      return (
        title.includes("ubicacion") ||
        title.includes("horario") ||
        title.includes("contacto") ||
        title.includes("informacion general")
      );
    });
    const ambient =
      preferred.length > 0
        ? preferred.slice(0, 2)
        : (knowledgeRows ?? [])
            .filter((entry) => entry.category === "negocio")
            .slice(0, 2);
    ranked = ambient.length > 0 ? ambient : (knowledgeRows ?? []).slice(0, 2);
  }

  // Booking intents: ensure tratamientos Knowledge is in the prompt context.
  const treatmentEntries = (knowledgeRows ?? []).filter(
    (entry) =>
      entry.category === "productos" ||
      /tratamiento|servicio|procedimiento/i.test(entry.title),
  );
  for (const entry of treatmentEntries) {
    if (!ranked.some((r) => r.id === entry.id)) {
      ranked = [...ranked, entry].slice(0, 6);
    }
  }

  console.info("[ai-agent] knowledge_retrieval", {
    knowledge_query: input.userMessage.slice(0, 200),
    business_id: input.businessId,
    knowledge_entries_selected: rankedDetailed.map((item) => ({
      title: item.entry.title,
      category: item.entry.category,
      score: item.score,
    })),
    knowledge_ambient_fallback:
      rankedDetailed.length === 0 ? ranked.map((e) => e.title) : [],
    knowledge_count_available: knowledgeRows?.length ?? 0,
  });

  const clinicToolsEnabled = clinicAppointmentToolsAllowed({
    industry: businessCtx.industry,
    clinicAppointmentToolsEnabled: settings.clinic_appointment_tools_enabled,
  });

  let clinicServicesList: ClinicService[] = [];
  if (clinicToolsEnabled) {
    const clinicServicesLoaded =
      await appointmentService.listActiveServicesTrusted({
        businessId: input.businessId,
      });
    if (clinicServicesLoaded.ok) {
      clinicServicesList = clinicServicesLoaded.data ?? [];
    }
  }

  const serviceResolution: ClinicServiceResolveResult | null = clinicToolsEnabled
    ? resolveClinicService({
        userMessage: input.userMessage,
        services: clinicServicesList,
      })
    : null;

  const serviceCatalog: ClinicServiceCatalogItem[] =
    serviceResolution?.catalog ?? toClinicServiceCatalog(clinicServicesList);

  let metadata = parseAgentMetadata(input.agentMetadata);

  if (serviceResolution?.status === "resolved") {
    const prev = metadata.appointment_intent;
    const patch = {
      action: "create" as const,
      service_id: serviceResolution.service_id,
      service_name: serviceResolution.service_name,
      awaiting_confirmation: false,
    };
    if (!prev?.awaiting_confirmation) {
      metadata = {
        ...metadata,
        appointment_intent: mergeAppointmentIntent(prev, patch),
      };
    } else {
      metadata = {
        ...metadata,
        appointment_intent: mergeAppointmentIntent(prev, {
          service_id: prev.service_id || serviceResolution.service_id,
          service_name: prev.service_name || serviceResolution.service_name,
          action: prev.action === "none" ? "create" : prev.action,
        }),
      };
    }
  } else if (serviceResolution?.status === "requires_consultation") {
    const prev = metadata.appointment_intent;
    const consultationId = serviceResolution.consultation_service_id;
    const consultationName = serviceResolution.consultation_service_name;
    if (consultationId && consultationName && !prev?.awaiting_confirmation) {
      metadata = {
        ...metadata,
        appointment_intent: mergeAppointmentIntent(prev, {
          action: "create",
          service_id: consultationId,
          service_name: consultationName,
          awaiting_confirmation: false,
        }),
      };
    }
  }

  let bookingSystemNote = "";
  let bookingServerTrace: AgentToolTraceItem[] = [];
  if (clinicToolsEnabled && input.contactId) {
    const bookingTurn = await advanceClinicBookingTurn({
      message: input.userMessage,
      metadata,
      trusted: {
        businessId: input.businessId,
        timezone: businessCtx.timezone,
        contactId: input.contactId,
      },
    });
    metadata = bookingTurn.metadata;
    bookingSystemNote = bookingTurn.systemNote;
    bookingServerTrace = bookingTurn.serverToolTrace.map((t) => ({
      name: t.name,
      arguments: JSON.stringify(t.arguments),
      result: t.result,
    }));

    if (input.conversationId) {
      await aiAgentRepository.updateConversationAgentState({
        conversationId: input.conversationId,
        businessId: input.businessId,
        agentMetadata: metadata as unknown as Record<string, unknown>,
      });
    }
  }

  const contactProfile = input.contactId
    ? await loadContactProfile(input.contactId, input.businessId)
    : null;

  const patientContextBlock = contactProfile
    ? [
        contactProfile.name
          ? `Nombre ya conocido: ${contactProfile.name}. NO lo vuelvas a pedir.`
          : "Nombre: no registrado.",
        contactProfile.phone
          ? `Teléfono/WhatsApp ya conocido: ${contactProfile.phone}. NO lo vuelvas a pedir.`
          : "Teléfono: no registrado.",
        contactProfile.email
          ? `Email (opcional, ya conocido): ${contactProfile.email}.`
          : "Email: no es obligatorio; no lo exijas para continuar.",
      ].join("\n")
    : "(sin contacto cargado)";

  const serviceCatalogBlock = formatClinicServiceCatalogForPrompt(serviceCatalog);

  let serviceResolutionBlock = "(Sin resolución de servicio en este turno.)";
  if (serviceResolution?.status === "resolved") {
    serviceResolutionBlock = `Intención de reserva detectada. Servicio validado en clinic_services: "${serviceResolution.service_name}" (service_id=${serviceResolution.service_id}). Usa exactamente ese service_id en tools. Continúa pidiendo fecha/profesional/horario. NO pidas nombre/teléfono/email si ya están conocidos.`;
  } else if (serviceResolution?.status === "requires_consultation") {
    const consultLine =
      serviceResolution.consultation_service_id && serviceResolution.consultation_service_name
        ? `Reserva la consulta de valoración: "${serviceResolution.consultation_service_name}" (service_id=${serviceResolution.consultation_service_id}).`
        : "Ofrece consulta de valoración (elige un servicio de consulta del catálogo si existe).";
    serviceResolutionBlock = `El paciente pidió "${serviceResolution.service_name}", que requiere valoración previa. NO reserves ese tratamiento como cita directa. ${consultLine} NO uses el service_id del tratamiento principal para clinic_create_appointment.`;
  } else if (serviceResolution?.status === "ambiguous") {
    serviceResolutionBlock = `Intención de reserva detectada, pero el servicio es ambiguo. Candidatos: ${serviceResolution.candidates.map((c) => `${c.name} (id=${c.id})`).join(", ")}. Pregunta cuál desea. NO inventes service_id.`;
  } else if (serviceResolution?.status === "not_found") {
    serviceResolutionBlock = `Intención de reserva detectada, pero el tratamiento pedido NO está en clinic_services activos. NO inventes service_id ni service_name. Ofrece consulta de valoración si figura en el catálogo.`;
  } else if (serviceResolution?.status === "inactive") {
    serviceResolutionBlock = `El servicio "${serviceResolution.service_name}" existe pero no está activo para reservas. NO uses su service_id. Ofrece alternativas del catálogo o consulta de valoración.`;
  } else if (serviceResolution?.status === "no_booking_intent") {
    serviceResolutionBlock =
      "No se detectó intención clara de reserva en este mensaje.";
  }

  const appointmentIntentBlock = metadata.appointment_intent
    ? JSON.stringify(metadata.appointment_intent)
    : "(vacío)";

  const bookingTurnBlock = bookingSystemNote
    ? `\n\nACTUALIZACIÓN DE ESTADO DE ESTE TURNO (obligatoria, server-side):\n${bookingSystemNote}`
    : "";

  const systemPrompt = buildAgentSystemPrompt({
    settings,
    knowledgeBlock: formatKnowledgeForPrompt(ranked),
    clinicToolsEnabled,
    timezone: businessCtx.timezone,
    patientContextBlock,
    serviceCatalogBlock,
    appointmentIntentBlock: `${appointmentIntentBlock}${bookingTurnBlock}`,
    serviceResolutionBlock,
  });

  const model = getAgentModel();
  let toolTrace: AgentToolTraceItem[] = [...bookingServerTrace];
  let generated:
    | {
        ok: true;
        result: AiAgentReplyResult;
        inputTokens: number | null;
        outputTokens: number | null;
        totalTokens: number | null;
      }
    | { ok: false; error: string };

  if (clinicToolsEnabled && input.contactId) {
    // Persist after booking-turn (already done above if conversationId).
    // Skip OpenAI tool create if server already created this turn.
    const skipTools =
      bookingServerTrace.some(
        (t) =>
          t.name === "clinic_create_appointment" &&
          typeof t.result === "object" &&
          t.result !== null &&
          "ok" in t.result &&
          (t.result as { ok: boolean }).ok === true,
      );

    if (skipTools) {
      generated = await generateAgentReplyWithOpenAI({
        apiKey,
        model,
        systemPrompt,
        messages: [
          ...input.history,
          { role: "user", content: input.userMessage },
        ],
      });
    } else {
      const withTools = await generateAgentReplyWithTools({
        apiKey,
        model,
        systemPrompt,
        messages: [
          ...input.history,
          { role: "user", content: input.userMessage },
        ],
        tools: getClinicAppointmentToolDefinitions(),
        executeTool: async (name, argsJson) => {
          const exec = await executeClinicAppointmentTool(name, argsJson, {
            trusted: {
              businessId: input.businessId,
              timezone: businessCtx.timezone,
              contactId: input.contactId!,
            },
            industry: businessCtx.industry,
            clinicAppointmentToolsEnabled:
              settings.clinic_appointment_tools_enabled,
            latestUserMessage: input.userMessage,
            metadata,
            serviceCatalog,
            onMetadataChange: (next) => {
              metadata = next;
            },
          });
          if (input.conversationId) {
            await aiAgentRepository.updateConversationAgentState({
              conversationId: input.conversationId,
              businessId: input.businessId,
              agentMetadata: metadata as unknown as Record<string, unknown>,
            });
          }
          return exec.result;
        },
      });
      if (!withTools.ok) {
        generated = withTools;
      } else {
        toolTrace = [...bookingServerTrace, ...withTools.toolTrace];
        generated = withTools;
      }
    }
  } else {
    generated = await generateAgentReplyWithOpenAI({
      apiKey,
      model,
      systemPrompt,
      messages: [
        ...input.history,
        { role: "user", content: input.userMessage },
      ],
    });
  }

  if (!generated.ok) {
    return generated;
  }

  // Persist metadata even if no tools ran (seeded service_name).
  if (input.conversationId && clinicToolsEnabled) {
    await aiAgentRepository.updateConversationAgentState({
      conversationId: input.conversationId,
      businessId: input.businessId,
      agentMetadata: metadata as unknown as Record<string, unknown>,
    });
  }

  let result = reconcileAgentConfidence({
    result: generated.result,
    userMessage: input.userMessage,
  });

  result = softenLowRiskHandoff({
    result,
    userMessage: input.userMessage,
  });

  if (
    shouldForceHandoff({
      result,
      userMessage: input.userMessage,
      handoffEnabled: settings.human_handoff_enabled,
    })
  ) {
    result = {
      ...result,
      should_handoff: true,
      handoff_reason:
        result.handoff_reason ??
        "Se requiere atención humana para esta consulta.",
      confidence: result.confidence === "high" ? "low" : result.confidence,
    };
  }

  const inputTokens = generated.inputTokens ?? 0;
  const outputTokens = generated.outputTokens ?? 0;
  const estimatedCost = estimateOpenAiCostUsd({
    model,
    inputTokens,
    outputTokens,
  });

  await aiAgentRepository.insertAiUsage({
    businessId: input.businessId,
    conversationId: input.conversationId,
    sourceMessageId: input.sourceMessageId,
    model,
    inputTokens: generated.inputTokens,
    outputTokens: generated.outputTokens,
    totalTokens: generated.totalTokens,
    estimatedCost,
    shouldHandoff: result.should_handoff,
    confidence: result.confidence,
  });

  return {
    ok: true,
    result,
    model,
    toolTrace,
    agentMetadata: metadata,
    serviceResolution,
    serviceCatalog,
  };
}

export async function testAiAgentForCurrentBusiness(
  input: TestAiAgentInput,
): Promise<
  | {
      ok: true;
      result: AiAgentReplyResult;
      model: string;
    }
  | { ok: false; error: string }
> {
  const parsed = testAiAgentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: formatZodIssues(parsed.error) };
  }

  const gate = await requireAdminWorkspace();
  if (!gate.ok) return gate;

  const { data: settingsRow, error } =
    await aiAgentRepository.getAiAgentSettings(gate.businessId);
  if (error) return { ok: false, error: error.message };

  const settings =
    settingsRow ?? defaultSettings(gate.businessId, gate.businessName);

  const generated = await runAgentGeneration({
    businessId: gate.businessId,
    settings,
    userMessage: parsed.data.message.trim(),
    history: [],
  });
  if (!generated.ok) return generated;
  return {
    ok: true,
    result: generated.result,
    model: generated.model,
  };
}

/**
 * Procesa un mensaje inbound ya persistido.
 * Solo actúa si el agente está enabled y la conversación no está en handoff.
 * Dedup por source_message_id en ai_usage.
 */
export async function processIncomingMessageWithAgent(input: {
  businessId: string;
  conversationId: string;
  contactId: string;
  inboundMessageId: string;
  inboundBody: string | null;
}): Promise<
  | { ok: true; skipped: true; reason: string }
  | { ok: true; skipped: false; handoff: boolean; replied: boolean }
  | { ok: false; error: string }
> {
  const body = input.inboundBody?.trim() ?? "";
  if (!body) {
    return { ok: true, skipped: true, reason: "sin_texto" };
  }

  const existing = await aiAgentRepository.findUsageBySourceMessage(
    input.inboundMessageId,
  );
  if (existing.data?.id) {
    return { ok: true, skipped: true, reason: "duplicado" };
  }

  const { data: settings } = await aiAgentRepository.getAiAgentSettingsAdmin(
    input.businessId,
  );
  if (!settings?.enabled) {
    return { ok: true, skipped: true, reason: "agente_desactivado" };
  }

  const { data: conversation } =
    await aiAgentRepository.getConversationAgentStateAdmin(
      input.conversationId,
      input.businessId,
    );

  if (!conversation) {
    return { ok: false, error: "Conversación no encontrada." };
  }

  if (conversation.agent_paused || conversation.human_handoff_at) {
    return { ok: true, skipped: true, reason: "handoff_activo" };
  }

  // Debounce ligero: si hay un inbound más nuevo, saltar (otro ciclo lo atenderá).
  const { data: recent } = await aiAgentRepository.listRecentMessagesAdmin(
    input.conversationId,
    input.businessId,
    5,
  );
  const newestInbound = (recent ?? []).find((m) => m.direction === "inbound");
  if (newestInbound && newestInbound.id !== input.inboundMessageId) {
    return { ok: true, skipped: true, reason: "mensaje_superado" };
  }

  const historyRows = [...(recent ?? [])]
    .reverse()
    .filter((m) => m.id !== input.inboundMessageId)
    .slice(-CONTEXT_MESSAGE_LIMIT);

  const history = historyRows
    .filter((m) => Boolean(m.body?.trim()))
    .map((m) => ({
      role:
        m.direction === "inbound"
          ? ("user" as const)
          : ("assistant" as const),
      content: m.body!.trim(),
    }));

  const generated = await runAgentGeneration({
    businessId: input.businessId,
    settings,
    userMessage: body,
    history,
    conversationId: input.conversationId,
    sourceMessageId: input.inboundMessageId,
    contactId: input.contactId,
    agentMetadata: conversation.agent_metadata,
  });

  if (!generated.ok) {
    const attempts = (conversation.agent_failed_attempts ?? 0) + 1;
    const shouldPause =
      settings.human_handoff_enabled &&
      attempts >= settings.max_failed_attempts;

    await aiAgentRepository.updateConversationAgentState({
      conversationId: input.conversationId,
      businessId: input.businessId,
      agentFailedAttempts: attempts,
      agentPaused: shouldPause ? true : undefined,
      humanHandoffAt: shouldPause ? new Date().toISOString() : undefined,
      humanHandoffReason: shouldPause
        ? `Fallos del agente: ${attempts}`
        : undefined,
    });

    return { ok: false, error: generated.error };
  }

  if (generated.result.should_handoff && settings.human_handoff_enabled) {
    await aiAgentRepository.updateConversationAgentState({
      conversationId: input.conversationId,
      businessId: input.businessId,
      agentPaused: true,
      humanHandoffAt: new Date().toISOString(),
      humanHandoffReason: generated.result.handoff_reason,
      agentFailedAttempts: 0,
    });

    return { ok: true, skipped: false, handoff: true, replied: false };
  }

  const { data: waSettings, error: waSettingsError } = await createAdminClient()
    .from("business_settings")
    .select("whatsapp_access_token, whatsapp_phone_number_id")
    .eq("business_id", input.businessId)
    .maybeSingle<{
      whatsapp_access_token: string | null;
      whatsapp_phone_number_id: string | null;
    }>();

  if (waSettingsError) {
    return { ok: false, error: waSettingsError.message };
  }

  const token = waSettings?.whatsapp_access_token;
  const phoneNumberId = waSettings?.whatsapp_phone_number_id;

  if (!token || !phoneNumberId) {
    return {
      ok: false,
      error: "WhatsApp no configurado para enviar la respuesta del agente.",
    };
  }

  const contactPhone = await loadContactPhone(
    input.contactId,
    input.businessId,
  );
  if (!contactPhone) {
    return { ok: false, error: "Contacto sin teléfono." };
  }

  const sent = await sendWhatsAppTextMessage({
    accessToken: token,
    phoneNumberId,
    to: contactPhone,
    body: generated.result.reply,
  });

  if (!sent.ok) {
    return { ok: false, error: sent.error };
  }

  await whatsappRepository.createMessage({
    businessId: input.businessId,
    conversationId: input.conversationId,
    waMessageId: sent.waMessageId,
    direction: "outbound",
    type: "text",
    body: generated.result.reply,
    rawPayload: sent.raw,
    createdAt: new Date().toISOString(),
  });

  await aiAgentRepository.updateConversationAgentState({
    conversationId: input.conversationId,
    businessId: input.businessId,
    agentFailedAttempts: 0,
  });

  await whatsappRepository.touchConversation({
    conversationId: input.conversationId,
    lastMessageAt: new Date().toISOString(),
    resetAiStatus: false,
  });

  return { ok: true, skipped: false, handoff: false, replied: true };
}

/**
 * Simula un turno del agente SIN enviar WhatsApp.
 * Multi-turn: reutiliza/crea conversación, persiste historial + appointment_intent.
 * Respeta flags reales. NO activa enabled ni envía WhatsApp.
 */
export async function simulateAgentTurnWithoutWhatsApp(input: {
  businessId: string;
  contactId: string;
  message: string;
  conversationId?: string | null;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<
  | {
      ok: true;
      result: AiAgentReplyResult;
      model: string;
      clinicToolsEligible: boolean;
      conversationId: string;
      toolTrace: AgentToolTraceItem[];
      appointment_intent: AgentConversationMetadata["appointment_intent"];
      serviceResolution: ClinicServiceResolveResult | null;
      serviceCatalog: ClinicServiceCatalogItem[];
    }
  | { ok: false; error: string }
> {
  const { data: settingsRow, error } =
    await aiAgentRepository.getAiAgentSettingsAdmin(input.businessId);
  if (error) return { ok: false, error: error.message };

  const businessCtx = await loadBusinessContext(input.businessId);
  if (!businessCtx) return { ok: false, error: "Empresa no encontrada." };

  const settings =
    settingsRow ?? defaultSettings(input.businessId, businessCtx.name);

  const conversationId = await ensureHarnessConversation({
    businessId: input.businessId,
    contactId: input.contactId,
    conversationId: input.conversationId ?? null,
  });
  if (!conversationId) {
    return { ok: false, error: "No se pudo crear/obtener conversación de harness." };
  }

  const { data: conv } =
    await aiAgentRepository.getConversationAgentStateAdmin(
      conversationId,
      input.businessId,
    );
  const agentMetadata = conv?.agent_metadata ?? null;

  let history = input.history ?? [];
  if (history.length === 0) {
    const { data: recent } = await aiAgentRepository.listRecentMessagesAdmin(
      conversationId,
      input.businessId,
      CONTEXT_MESSAGE_LIMIT,
    );
    history = [...(recent ?? [])]
      .reverse()
      .filter((m) => Boolean(m.body?.trim()))
      .map((m) => ({
        role:
          m.direction === "inbound"
            ? ("user" as const)
            : ("assistant" as const),
        content: m.body!.trim(),
      }));
  }

  const now = new Date().toISOString();
  const inboundWaId = `harness-in-${crypto.randomUUID()}`;
  await whatsappRepository.createMessage({
    businessId: input.businessId,
    conversationId,
    waMessageId: inboundWaId,
    direction: "inbound",
    type: "text",
    body: input.message.trim(),
    rawPayload: { harness: true, source: "clinic-agent-harness" },
    createdAt: now,
  });

  const generated = await runAgentGeneration({
    businessId: input.businessId,
    settings,
    userMessage: input.message.trim(),
    history,
    conversationId,
    contactId: input.contactId,
    agentMetadata,
    sourceMessageId: null,
  });

  if (!generated.ok) return generated;

  const outboundWaId = `harness-out-${crypto.randomUUID()}`;
  await whatsappRepository.createMessage({
    businessId: input.businessId,
    conversationId,
    waMessageId: outboundWaId,
    direction: "outbound",
    type: "text",
    body: generated.result.reply,
    rawPayload: { harness: true, source: "clinic-agent-harness" },
    createdAt: new Date().toISOString(),
  });

  await whatsappRepository.touchConversation({
    conversationId,
    lastMessageAt: new Date().toISOString(),
    resetAiStatus: false,
  });

  return {
    ok: true,
    result: generated.result,
    model: generated.model,
    conversationId,
    toolTrace: generated.toolTrace,
    appointment_intent: generated.agentMetadata.appointment_intent,
    serviceResolution: generated.serviceResolution,
    serviceCatalog: generated.serviceCatalog,
    clinicToolsEligible: clinicAppointmentToolsAllowed({
      industry: businessCtx.industry,
      clinicAppointmentToolsEnabled: Boolean(
        settings.clinic_appointment_tools_enabled,
      ),
    }),
  };
}

async function ensureHarnessConversation(input: {
  businessId: string;
  contactId: string;
  conversationId: string | null;
}): Promise<string | null> {
  // Continuar multi-turn: reutilizar conversación indicada.
  if (input.conversationId) {
    const { data } = await aiAgentRepository.getConversationAgentStateAdmin(
      input.conversationId,
      input.businessId,
    );
    if (data && data.contact_id === input.contactId) return data.id;
    return null;
  }

  // Primer turno de harness: conversación NUEVA (unique contact_id → borrar previa).
  const supabase = createAdminClient();
  const existing = await whatsappRepository.findConversationByContactId(
    input.contactId,
  );
  if (existing.data?.id) {
    await supabase
      .from("conversations")
      .delete()
      .eq("id", existing.data.id)
      .eq("business_id", input.businessId)
      .eq("contact_id", input.contactId);
  }

  const created = await whatsappRepository.createConversation({
    businessId: input.businessId,
    contactId: input.contactId,
    lastMessageAt: new Date().toISOString(),
  });
  return created.data?.id ?? null;
}

async function loadContactProfile(
  contactId: string,
  businessId: string,
): Promise<{ name: string | null; phone: string | null; email: string | null } | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("contacts")
    .select("name, phone, email")
    .eq("id", contactId)
    .eq("business_id", businessId)
    .maybeSingle<{
      name: string | null;
      phone: string | null;
      email: string | null;
    }>();
  return data ?? null;
}

async function loadContactPhone(
  contactId: string,
  businessId: string,
): Promise<string | null> {
  const profile = await loadContactProfile(contactId, businessId);
  return profile?.phone ?? null;
}
