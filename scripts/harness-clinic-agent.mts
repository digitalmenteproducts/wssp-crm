/**
 * Harness DEV: simula un turno del Agente IA SIN WhatsApp.
 *
 * Uso:
 *   npx tsx scripts/harness-clinic-agent.mts --business <uuid> --contact <uuid> --message "Quiero una cita"
 *
 * Respeta flags reales (enabled + clinic_appointment_tools_enabled).
 * NO activa nada automáticamente.
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

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
