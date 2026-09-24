/**
 * 10 pruebas de razonamiento del Agente IA (CLINICA PASTORE).
 * Uso: npx tsx scripts/test-clinica-pastore-reasoning.mts
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

import { buildAgentSystemPrompt } from "../src/lib/ai/agent-prompt";
import {
  formatKnowledgeForPrompt,
  normalizeText,
  rankKnowledgeEntriesDetailed,
  reconcileAgentConfidence,
  shouldForceHandoff,
  softenLowRiskHandoff,
} from "../src/lib/ai/knowledge-retrieval";
import type { AiAgentSettings, AiKnowledgeEntry } from "../src/types/ai-agent";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const BUSINESS_ID = "ee05dfbd-839b-4f52-be6f-327080995e56";

const QUESTIONS = [
  "¿Trabajan con lluvia?",
  "¿Puedo ir acompañado?",
  "¿Tienen aire acondicionado?",
  "¿Cuánto cuesta la rinomodelación?",
  "¿Atienden mañana a las 22:00?",
  "¿Mañana por el feriado van a abrir?",
  "¿Qué medicamento puedo tomar después del procedimiento?",
  "¿Puedo hacerme bótox si estoy embarazada?",
  "¿Puedo llegar caminando?",
  "¿Tienen estacionamiento privado?",
];

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("FAIL=missing OPENAI_API_KEY");
  process.exit(1);
}

const client = process.env.DATABASE_URL
  ? new pg.Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : new pg.Client({
      host: "aws-0-us-east-2.pooler.supabase.com",
      port: 6543,
      user: "postgres.prmanzxthcznfnawhymt",
      password: process.env.SUPABASE_DB_PASSWORD,
      database: "postgres",
      ssl: { rejectUnauthorized: false },
    });

await client.connect();

try {
  const settingsRes = await client.query(
    `select * from public.ai_agent_settings where business_id = $1`,
    [BUSINESS_ID],
  );
  const knowledgeRes = await client.query(
    `select * from public.ai_knowledge_entries where business_id = $1 and enabled = true`,
    [BUSINESS_ID],
  );
  const wa = await client.query(
    `select whatsapp_connection_status from public.business_settings where business_id = $1`,
    [BUSINESS_ID],
  );

  const settings = settingsRes.rows[0] as AiAgentSettings;
  const knowledge = knowledgeRes.rows as AiKnowledgeEntry[];

  console.log(`AGENT_ENABLED=${settings.enabled}`);
  console.log(`WHATSAPP=${wa.rows[0]?.whatsapp_connection_status}`);

  for (const q of QUESTIONS) {
    const rankedDetailed = rankKnowledgeEntriesDetailed(knowledge, q, 5);
    let ranked = rankedDetailed.map((item) => item.entry);
    if (ranked.length === 0 && knowledge.length > 0) {
      const preferred = knowledge.filter((entry) => {
        const title = normalizeText(entry.title);
        return (
          title.includes("ubicacion") ||
          title.includes("horario") ||
          title.includes("contacto") ||
          title.includes("informacion general")
        );
      });
      ranked =
        preferred.length > 0
          ? preferred.slice(0, 2)
          : knowledge.filter((e) => e.category === "negocio").slice(0, 2);
    }

    const systemPrompt = buildAgentSystemPrompt({
      settings,
      knowledgeBlock: formatKnowledgeForPrompt(ranked),
    });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_AGENT_MODEL || "gpt-4o-mini",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: q },
        ],
      }),
    });

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    console.log(`\nQUERY=${q}`);
    console.log(
      `SELECTED=${JSON.stringify(rankedDetailed.map((r) => ({ title: r.entry.title, score: r.score })))}`,
    );
    console.log(`AMBIENT=${rankedDetailed.length === 0 ? ranked.map((e) => e.title).join(" | ") : "-"}`);

    if (!response.ok) {
      console.log(`ERROR=${json.error?.message ?? response.status}`);
      continue;
    }

    let parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}") as {
      reply: string;
      should_handoff: boolean;
      handoff_reason: string | null;
      confidence: "high" | "medium" | "low";
    };

    parsed = reconcileAgentConfidence({
      result: parsed,
      userMessage: q,
    });
    parsed = softenLowRiskHandoff({
      result: parsed,
      userMessage: q,
    });

    if (
      shouldForceHandoff({
        result: parsed,
        userMessage: q,
        handoffEnabled: settings.human_handoff_enabled,
      })
    ) {
      parsed = {
        ...parsed,
        should_handoff: true,
        handoff_reason:
          parsed.handoff_reason ??
          "Se requiere atención humana para esta consulta.",
        confidence: parsed.confidence === "high" ? "low" : parsed.confidence,
      };
    }

    console.log(`REPLY=${parsed.reply}`);
    console.log(`CONFIDENCE=${parsed.confidence}`);
    console.log(`HANDOFF=${parsed.should_handoff}`);
    console.log(`REASON=${parsed.handoff_reason}`);
  }
} finally {
  await client.end();
}
