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
  const rates =
    input.model.includes("gpt-4o") && !input.model.includes("mini")
      ? { in: 2.5 / 1_000_000, out: 10 / 1_000_000 }
      : { in: 0.15 / 1_000_000, out: 0.6 / 1_000_000 };

  return Number(
    (input.inputTokens * rates.in + input.outputTokens * rates.out).toFixed(6),
  );
}

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

type OpenAiToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

async function callChatCompletions(input: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  tools?: OpenAiToolDef[];
  toolChoice?: "auto" | "none";
  responseFormatJson?: boolean;
  temperature?: number;
}): Promise<
  | {
      ok: true;
      message: ChatMessage;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    }
  | { ok: false; error: string }
> {
  const body: Record<string, unknown> = {
    model: input.model,
    temperature: input.temperature ?? 0.3,
    messages: input.messages,
  };
  if (input.tools && input.tools.length > 0) {
    body.tools = input.tools;
    body.tool_choice = input.toolChoice ?? "auto";
  }
  if (input.responseFormatJson) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    choices?: Array<{ message?: ChatMessage }>;
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

  const message = payload.choices?.[0]?.message;
  if (!message) {
    return { ok: false, error: "OpenAI no devolvió mensaje." };
  }

  return {
    ok: true,
    message,
    inputTokens: payload.usage?.prompt_tokens ?? 0,
    outputTokens: payload.usage?.completion_tokens ?? 0,
    totalTokens: payload.usage?.total_tokens ?? 0,
  };
}

function parseFinalJson(content: string | null | undefined): AiAgentReplyResult | null {
  const raw = content?.trim() ?? "";
  if (!raw) return null;
  try {
    const parsed = aiAgentReplyResultSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    // Sometimes model wraps JSON in prose — try extract
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = aiAgentReplyResultSchema.safeParse(JSON.parse(match[0]));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
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
  const called = await callChatCompletions({
    apiKey: input.apiKey,
    model: input.model,
    responseFormatJson: true,
    messages: [
      { role: "system", content: input.systemPrompt },
      ...input.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ],
  });

  if (!called.ok) return called;

  const result = parseFinalJson(called.message.content);
  if (!result) {
    return {
      ok: false,
      error: "La respuesta estructurada del agente es inválida.",
    };
  }

  return {
    ok: true,
    result,
    inputTokens: called.inputTokens,
    outputTokens: called.outputTokens,
    totalTokens: called.totalTokens,
    rawContent: called.message.content ?? "",
  };
}

/**
 * Agent loop with optional OpenAI tools, then a final JSON reply turn.
 */
export async function generateAgentReplyWithTools(input: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  tools: OpenAiToolDef[];
  maxToolRounds?: number;
  executeTool: (
    name: string,
    argsJson: string,
  ) => Promise<unknown>;
}): Promise<
  | {
      ok: true;
      result: AiAgentReplyResult;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      toolRounds: number;
      rawContent: string;
    }
  | { ok: false; error: string }
> {
  const maxRounds = input.maxToolRounds ?? 4;
  const messages: ChatMessage[] = [
    { role: "system", content: input.systemPrompt },
    ...input.messages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    })),
  ];

  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let toolRounds = 0;

  for (let round = 0; round < maxRounds; round += 1) {
    const called = await callChatCompletions({
      apiKey: input.apiKey,
      model: input.model,
      messages,
      tools: input.tools,
      toolChoice: "auto",
      responseFormatJson: false,
      temperature: 0.2,
    });
    if (!called.ok) return called;

    inputTokens += called.inputTokens;
    outputTokens += called.outputTokens;
    totalTokens += called.totalTokens;

    const toolCalls = called.message.tool_calls ?? [];
    if (toolCalls.length === 0) {
      // Model answered without tools — try parse JSON, else force final JSON turn
      const direct = parseFinalJson(called.message.content);
      if (direct) {
        return {
          ok: true,
          result: direct,
          inputTokens,
          outputTokens,
          totalTokens,
          toolRounds,
          rawContent: called.message.content ?? "",
        };
      }
      messages.push({
        role: "assistant",
        content: called.message.content,
      });
      break;
    }

    toolRounds += 1;
    messages.push({
      role: "assistant",
      content: called.message.content ?? null,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      const toolResult = await input.executeTool(
        call.function.name,
        call.function.arguments ?? "{}",
      );
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(toolResult),
      });
    }
  }

  // Final JSON-only turn (no tools)
  messages.push({
    role: "system",
    content:
      'Responde ahora ÚNICAMENTE con JSON válido: {"reply":"...","should_handoff":false,"handoff_reason":null,"confidence":"high"|"medium"|"low"}. No menciones tools, IDs internos ni UTC al paciente. Si una tool falló con NEEDS_CONFIRMATION, pide confirmación. Si falló por horario ocupado, ofrece alternativas de la tool. Solo di que la cita quedó reservada si la tool devolvió ok:true en create/reschedule/cancel.',
  });

  const finalCall = await callChatCompletions({
    apiKey: input.apiKey,
    model: input.model,
    messages,
    responseFormatJson: true,
    temperature: 0.3,
  });
  if (!finalCall.ok) return finalCall;

  inputTokens += finalCall.inputTokens;
  outputTokens += finalCall.outputTokens;
  totalTokens += finalCall.totalTokens;

  const result = parseFinalJson(finalCall.message.content);
  if (!result) {
    return {
      ok: false,
      error: "La respuesta estructurada del agente es inválida.",
    };
  }

  return {
    ok: true,
    result,
    inputTokens,
    outputTokens,
    totalTokens,
    toolRounds,
    rawContent: finalCall.message.content ?? "",
  };
}
