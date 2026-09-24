/**
 * Harness DEV: simula turnos del Agente IA SIN WhatsApp (multi-turn).
 *
 * Primer turno:
 *   npx tsx scripts/harness-clinic-agent.mts --business <uuid> --contact <uuid> --message "..."
 *
 * Turnos siguientes (reutiliza conversación + appointment_intent):
 *   npx tsx scripts/harness-clinic-agent.mts --business <uuid> --contact <uuid> --conversation <uuid> --message "..."
 *
 * Respeta flags reales. NO activa enabled. NO envía WhatsApp.
 */
import fs from "node:fs";
import path from "node:path";

import { simulateAgentTurnWithoutWhatsApp } from "../src/services/ai/ai-agent.service";

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
    if (!value) continue;
    if (!(key in process.env) || !process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0) return process.argv[idx + 1];
  return undefined;
}

const businessId = arg("business");
const contactId = arg("contact");
const message = arg("message");
const conversationId = arg("conversation");

if (!businessId || !contactId || !message) {
  console.error(
    "Usage: npx tsx scripts/harness-clinic-agent.mts --business <id> --contact <id> --message \"...\" [--conversation <id>]",
  );
  process.exit(1);
}

const result = await simulateAgentTurnWithoutWhatsApp({
  businessId,
  contactId,
  message,
  conversationId: conversationId ?? null,
});

if (!result.ok) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(1);
}

const summary = {
  ok: true,
  conversationId: result.conversationId,
  clinicToolsEligible: result.clinicToolsEligible,
  model: result.model,
  reply: result.result.reply,
  should_handoff: result.result.should_handoff,
  confidence: result.result.confidence,
  serviceResolution: result.serviceResolution,
  tools: result.toolTrace.map((t) => ({
    name: t.name,
    arguments: (() => {
      try {
        return JSON.parse(t.arguments) as unknown;
      } catch {
        return t.arguments;
      }
    })(),
    result: t.result,
  })),
  appointment_intent: result.appointment_intent ?? null,
  tip: conversationId
    ? undefined
    : `Siguiente turno: añade --conversation ${result.conversationId}`,
};

console.log(JSON.stringify(summary, null, 2));
