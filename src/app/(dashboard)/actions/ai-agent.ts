"use server";

import { revalidatePath } from "next/cache";

import { ROUTES } from "@/config/app";
import * as aiAgentService from "@/services/ai/ai-agent.service";

export type AiAgentFormState = {
  error?: string;
  message?: string;
};

export async function saveAiAgentSettingsAction(
  _prev: AiAgentFormState,
  formData: FormData,
): Promise<AiAgentFormState> {
  const result = await aiAgentService.saveAiAgentSettingsForCurrentBusiness({
    enabled: formData.get("enabled") === "on" || formData.get("enabled") === "true",
    agent_name: String(formData.get("agent_name") ?? ""),
    business_name: String(formData.get("business_name") ?? ""),
    business_description: String(formData.get("business_description") ?? ""),
    system_instructions: String(formData.get("system_instructions") ?? ""),
    tone: String(formData.get("tone") ?? "profesional") as
      | "profesional"
      | "amigable"
      | "comercial"
      | "directo"
      | "personalizado",
    custom_tone_instructions: String(
      formData.get("custom_tone_instructions") ?? "",
    ),
    language: String(formData.get("language") ?? "auto") as
      | "auto"
      | "es"
      | "en",
    response_length: String(formData.get("response_length") ?? "breve") as
      | "breve"
      | "normal"
      | "detallada",
    human_handoff_enabled:
      formData.get("human_handoff_enabled") === "on" ||
      formData.get("human_handoff_enabled") === "true",
    human_handoff_instructions: String(
      formData.get("human_handoff_instructions") ?? "",
    ),
    max_failed_attempts: Number(formData.get("max_failed_attempts") ?? 2),
  });

  revalidatePath(ROUTES.agenteIa);

  if (!result.ok) return { error: result.error };
  return { message: result.message };
}

export async function upsertKnowledgeAction(
  _prev: AiAgentFormState,
  formData: FormData,
): Promise<AiAgentFormState> {
  const idRaw = String(formData.get("id") ?? "").trim();
  const result = await aiAgentService.upsertKnowledgeForCurrentBusiness({
    id: idRaw || undefined,
    title: String(formData.get("title") ?? ""),
    content: String(formData.get("content") ?? ""),
    category: String(formData.get("category") ?? "otro") as
      | "faq"
      | "negocio"
      | "productos"
      | "politicas"
      | "envios"
      | "pagos"
      | "otro",
    enabled:
      formData.get("enabled") === "on" || formData.get("enabled") === "true",
  });

  revalidatePath(ROUTES.agenteIa);
  if (!result.ok) return { error: result.error };
  return { message: result.message };
}

export async function deleteKnowledgeAction(
  _prev: AiAgentFormState,
  formData: FormData,
): Promise<AiAgentFormState> {
  const result = await aiAgentService.deleteKnowledgeForCurrentBusiness(
    String(formData.get("id") ?? ""),
  );
  revalidatePath(ROUTES.agenteIa);
  if (!result.ok) return { error: result.error };
  return { message: result.message };
}

export type TestAgentState = {
  error?: string;
  reply?: string;
  should_handoff?: boolean;
  handoff_reason?: string | null;
  confidence?: string;
  model?: string;
};

export async function testAiAgentAction(
  _prev: TestAgentState,
  formData: FormData,
): Promise<TestAgentState> {
  const result = await aiAgentService.testAiAgentForCurrentBusiness({
    message: String(formData.get("message") ?? ""),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  return {
    reply: result.result.reply,
    should_handoff: result.result.should_handoff,
    handoff_reason: result.result.handoff_reason,
    confidence: result.result.confidence,
    model: result.model,
  };
}
