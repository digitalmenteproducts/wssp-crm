import { getOptionalServerEnv } from "@/lib/env";
import * as aiRepository from "@/repositories/ai.repository";
import type { ConversationForClassification } from "@/repositories/ai.repository";
import { classifyConversationWithOpenAI } from "@/services/openai/classify.service";
import type { ClassificationResult } from "@/schemas/ai";

export type ClassificationBatchResult = {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errors: string[];
};

function buildTranscript(conversation: ConversationForClassification): string {
  const messages = [...(conversation.messages ?? [])].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  if (messages.length === 0) {
    return "(Sin mensajes de texto)";
  }

  return messages
    .map((message) => {
      const who = message.direction === "inbound" ? "Cliente" : "Negocio";
      const body = message.body?.trim() || `[${message.type}]`;
      return `${who}: ${body}`;
    })
    .join("\n");
}

function resolveApiKey(businessKey: string | null | undefined): string | null {
  if (businessKey?.trim()) {
    return businessKey.trim();
  }

  return getOptionalServerEnv().OPENAI_API_KEY ?? null;
}

export async function classifySingleConversation(
  conversation: ConversationForClassification,
): Promise<{ ok: true; result: ClassificationResult } | { ok: false; error: string }> {
  if (!conversation.contact) {
    return { ok: false, error: "Conversación sin contacto." };
  }

  const { data: settings, error: settingsError } =
    await aiRepository.getBusinessSettingsForAi(conversation.business_id);

  if (settingsError) {
    return { ok: false, error: settingsError.message };
  }

  if (!settings?.ai_engine_enabled) {
    return { ok: false, error: "El motor de IA está desactivado." };
  }

  const apiKey = resolveApiKey(settings.openai_api_key);
  if (!apiKey) {
    return {
      ok: false,
      error:
        "Falta OpenAI API Key (Configuración → Integraciones o OPENAI_API_KEY).",
    };
  }

  await aiRepository.setConversationAiStatus(conversation.id, "procesando");

  try {
    const result = await classifyConversationWithOpenAI({
      apiKey,
      systemPrompt: settings.classification_prompt,
      transcript: buildTranscript(conversation),
    });

    const { error: analysisError } = await aiRepository.insertAiAnalysis({
      conversationId: conversation.id,
      businessId: conversation.business_id,
      contactId: conversation.contact.id,
      summary: result.summary,
      product: result.product,
      subcategory: result.subcategory,
      intent: result.intent,
      status: result.status,
      reason: result.reason,
      segment: result.segment,
      confidence: result.confidence,
      attributes: (() => {
        const base =
          result.attributes && typeof result.attributes === "object"
            ? { ...result.attributes }
            : {};
        const tags = Array.isArray(base.tags)
          ? base.tags.filter((item): item is string => typeof item === "string")
          : [];
        if (result.reason?.trim() && !tags.some((tag) => tag.toLowerCase() === result.reason!.trim().toLowerCase())) {
          tags.push(result.reason.trim());
        }
        if (result.segment?.trim() && !tags.some((tag) => tag.toLowerCase() === result.segment!.trim().toLowerCase())) {
          tags.push(result.segment.trim());
        }
        return {
          ...base,
          tags,
          ai_tags: tags,
          manual_tags: Array.isArray(base.manual_tags) ? base.manual_tags : [],
        };
      })(),
      rawJson: result,
    });

    if (analysisError) {
      throw new Error(analysisError.message);
    }

    await aiRepository.updateContactStatus(
      conversation.contact.id,
      result.status,
    );
    await aiRepository.setConversationAiStatus(conversation.id, "analizado");

    return { ok: true, result };
  } catch (error) {
    await aiRepository.setConversationAiStatus(conversation.id, "error");
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Error de clasificación.",
    };
  }
}

export async function runClassificationBatch(input?: {
  businessId?: string;
  inactivityHours?: number;
  limit?: number;
  force?: boolean;
}): Promise<ClassificationBatchResult> {
  const limit = input?.limit ?? 20;
  const force = input?.force ?? false;
  const errors: string[] = [];
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  let conversations: ConversationForClassification[] = [];

  if (input?.businessId) {
    const { data: settings } = await aiRepository.getBusinessSettingsForAi(
      input.businessId,
    );
    const inactivityHours = force
      ? 0
      : (input.inactivityHours ??
        Number(settings?.classification_inactivity_hours ?? 1));

    if (settings && !settings.ai_engine_enabled) {
      return {
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        errors: ["Motor de IA desactivado para esta empresa."],
      };
    }

    const { data, error } = await aiRepository.listDueConversationsForBusiness({
      businessId: input.businessId,
      inactivityHours,
      limit,
    });

    if (error) {
      return {
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        errors: [error.message],
      };
    }

    conversations = data ?? [];
  } else {
    const inactivityHours = force ? 0 : (input?.inactivityHours ?? 1);
    const { data, error } = await aiRepository.listDueConversations({
      inactivityHours,
      limit,
    });

    if (error) {
      return {
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        errors: [error.message],
      };
    }

    conversations = data ?? [];
  }

  for (const conversation of conversations) {
    processed += 1;
    const result = await classifySingleConversation(conversation);
    if (result.ok) {
      succeeded += 1;
    } else {
      failed += 1;
      errors.push(`${conversation.id}: ${result.error}`);
    }
  }

  if (conversations.length === 0) {
    skipped = 0;
  }

  if (succeeded > 0) {
    const businessIds = new Set(
      conversations.map((conversation) => conversation.business_id),
    );
    const { syncAiSegmentsForBusiness } = await import(
      "@/services/segmentation/sync-ai-segments.service"
    );
    for (const businessId of businessIds) {
      await syncAiSegmentsForBusiness(businessId);
    }
  }

  return { processed, succeeded, failed, skipped, errors };
}

export async function reanalyzeConversation(
  conversationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } =
    await aiRepository.getConversationForClassification(conversationId);

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Conversación no encontrada." };
  }

  await aiRepository.setConversationAiStatus(conversationId, "nuevo");
  const refreshed = await aiRepository.getConversationForClassification(
    conversationId,
  );

  if (refreshed.error || !refreshed.data) {
    return {
      ok: false,
      error: refreshed.error?.message ?? "No se pudo recargar la conversación.",
    };
  }

  const result = await classifySingleConversation(refreshed.data);
  if (!result.ok) {
    return result;
  }

  return { ok: true };
}
