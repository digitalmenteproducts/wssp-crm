import { readFileSync } from "node:fs";
import path from "node:path";

import {
  classificationResultSchema,
  type ClassificationResult,
} from "@/schemas/ai";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function loadDefaultPrompt(): string {
  try {
    return readFileSync(
      path.join(process.cwd(), "src", "prompts", "classification.txt"),
      "utf8",
    );
  } catch {
    return "Analiza la conversación y responde JSON con summary, product, subcategory, intent, status, reason, segment, confidence y attributes.";
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
  const systemPrompt = input.systemPrompt?.trim() || loadDefaultPrompt();
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

  const parsedJson = extractJsonObject(content);
  const parsed = classificationResultSchema.safeParse(parsedJson);

  if (!parsed.success) {
    throw new Error(
      `JSON de clasificación inválido: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    );
  }

  return parsed.data;
}
