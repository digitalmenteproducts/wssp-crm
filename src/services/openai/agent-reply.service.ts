import { getOptionalServerEnv } from "@/lib/env";
import { aiAgentReplyResultSchema } from "@/schemas/ai-agent";
import type { AiAgentReplyResult } from "@/types/ai-agent";

export function getCentralOpenAiApiKey(): string | null {
  return getOptionalServerEnv().OPENAI_API_KEY?.trim() || null;
}

export function getAgentModel(): string {
  return (
    getOptionalServerEnv().OPENAI_AGENT_MODEL?.trim() ||
    "gpt-4o-mini"
  );
}

/** Estimación gruesa USD para gpt-4o-mini (solo métricas internas). */
export function estimateOpenAiCostUsd(input: {
  model: string;
  inputTokens: number;
  outputTokens: number;
}): number {
  // Precios aproximados; no usar para facturación.
  const rates =
    input.model.includes("gpt-4o") && !input.model.includes("mini")
      ? { in: 2.5 / 1_000_000, out: 10 / 1_000_000 }
      : { in: 0.15 / 1_000_000, out: 0.6 / 1_000_000 };

  return Number(
    (input.inputTokens * rates.in + input.outputTokens * rates.out).toFixed(6),
  );
}

export async function generateAgentReplyWithOpenAI(input: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
}): Promise<
  | {
      ok: true;
      result: AiAgentReplyResult;
      inputTokens: number | null;
      outputTokens: number | null;
      totalTokens: number | null;
      rawContent: string;
    }
  | { ok: false; error: string }
> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: input.systemPrompt },
        ...input.messages,
      ],
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
    error?: { message?: string };
  };

  if (!response.ok) {
    return {
      ok: false,
      error: payload.error?.message ?? `OpenAI respondió ${response.status}.`,
    };
  }

  const rawContent = payload.choices?.[0]?.message?.content?.trim() ?? "";
  if (!rawContent) {
    return { ok: false, error: "OpenAI no devolvió contenido." };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawContent) as unknown;
  } catch {
    return { ok: false, error: "La respuesta de OpenAI no es JSON válido." };
  }

  const parsed = aiAgentReplyResultSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return {
      ok: false,
      error: "La respuesta estructurada del agente es inválida.",
    };
  }

  return {
    ok: true,
    result: parsed.data,
    inputTokens: payload.usage?.prompt_tokens ?? null,
    outputTokens: payload.usage?.completion_tokens ?? null,
    totalTokens: payload.usage?.total_tokens ?? null,
    rawContent,
  };
}
