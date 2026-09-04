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
  rankKnowledgeEntries,
} from "@/lib/ai/knowledge-retrieval";
import {
  estimateOpenAiCostUsd,
  generateAgentReplyWithOpenAI,
  getAgentModel,
  getCentralOpenAiApiKey,
} from "@/services/openai/agent-reply.service";
import { sendWhatsAppTextMessage } from "@/services/whatsapp/send-text.service";
import type {
  AiAgentReplyResult,
  AiAgentSettings,
  AiKnowledgeEntry,
} from "@/types/ai-agent";

const CONTEXT_MESSAGE_LIMIT = 16;

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

async function runAgentGeneration(input: {
  businessId: string;
  settings: AiAgentSettings;
  userMessage: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  conversationId?: string | null;
  sourceMessageId?: string | null;
}): Promise<
  | {
      ok: true;
      result: AiAgentReplyResult;
      model: string;
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

  const { data: knowledgeRows } =
    await aiAgentRepository.listKnowledgeEntriesAdmin(input.businessId, {
      enabledOnly: true,
      limit: 80,
    });

  const ranked = rankKnowledgeEntries(
    knowledgeRows ?? [],
    input.userMessage,
    6,
  );
  const systemPrompt = buildAgentSystemPrompt({
    settings: input.settings,
    knowledgeBlock: formatKnowledgeForPrompt(ranked),
  });

  const model = getAgentModel();
  const generated = await generateAgentReplyWithOpenAI({
    apiKey,
    model,
    systemPrompt,
    messages: [
      ...input.history,
      { role: "user", content: input.userMessage },
    ],
  });

  if (!generated.ok) {
    return generated;
  }

  let result = generated.result;

  if (
    input.settings.human_handoff_enabled &&
    result.confidence === "low" &&
    !result.should_handoff
  ) {
    result = {
      ...result,
      should_handoff: true,
      handoff_reason:
        result.handoff_reason ??
        "Baja confianza en la respuesta; se requiere atención humana.",
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

  return { ok: true, result, model };
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

  return runAgentGeneration({
    businessId: gate.businessId,
    settings,
    userMessage: parsed.data.message.trim(),
    history: [],
  });
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

async function loadContactPhone(
  contactId: string,
  businessId: string,
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("contacts")
    .select("phone")
    .eq("id", contactId)
    .eq("business_id", businessId)
    .maybeSingle<{ phone: string }>();
  return data?.phone ?? null;
}
