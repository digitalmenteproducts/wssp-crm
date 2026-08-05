import { readFileSync } from "node:fs";
import path from "node:path";

import type { ClassificationResult } from "@/schemas/ai";
import { normalizeClassificationPayload } from "@/services/openai/normalize-classification";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const STRICT_JSON_CONTRACT = `
Responde SOLO con un objeto JSON (sin markdown) usando EXACTAMENTE estas claves en inglés:
{
  "summary": "string",
  "product": "string|null",
  "subcategory": "string|null",
  "intent": "string|null",
  "status": "nuevo|interesado|no_compro|cliente|no_contactar",
  "reason": "string|null",
  "segment": "string|null",
  "confidence": 0.0,
  "attributes": { "delivery": false, "price_sensitive": false, "tags": [] }
}
No uses claves en español. status debe ser uno de esos 5 valores.
`.trim();

function loadDefaultPrompt(): string {
  try {
    return readFileSync(
      path.join(process.cwd(), "src", "prompts", "classification.txt"),
      "utf8",
    );
  } catch {
    return "Analiza la conversación comercial de WhatsApp y clasifica al contacto.";
  }
}

function extractJsonObject(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    }
    throw new Error("La respuesta de OpenAI no contiene JSON válido.");
  }
}

export async function classifyConversationWithOpenAI(input: {
  apiKey: string;
  systemPrompt?: string | null;
  transcript: string;
  model?: string;
}): Promise<ClassificationResult> {
  const basePrompt = input.systemPrompt?.trim() || loadDefaultPrompt();
  const systemPrompt = `${basePrompt}\n\n${STRICT_JSON_CONTRACT}`;
  const model = input.model ?? "gpt-4o-mini";

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Conversación de WhatsApp:\n\n${input.transcript}`,
    },
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `OpenAI error ${response.status}: ${errorBody.slice(0, 400)}`,
    );
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI no devolvió contenido.");
  }

  try {
    const parsedJson = extractJsonObject(content);
    return normalizeClassificationPayload(parsedJson);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Error desconocido";
    throw new Error(
      `JSON de clasificación inválido: ${detail}. Raw: ${content.slice(0, 280)}`,
    );
  }
}
