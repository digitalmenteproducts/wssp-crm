/**
 * Prueba end-to-end local: retrieval + OpenAI para CLINICA PASTORE.
 * No activa el agente ni toca WhatsApp.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

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

// Reuse ranking from test script by spawning? Inline import via dynamic eval of file is messy.
// Spawn the ranking by importing duplicated minimal - call retrieval test then OpenAI.

const BUSINESS_ID = "ee05dfbd-839b-4f52-be6f-327080995e56";

const STOPWORDS = new Set([
  "que","cual","cuales","como","donde","cuando","quien","quienes","por","para","con","sin",
  "una","uno","unos","unas","los","las","del","de","la","el","al","en","es","son","esta","estan",
  "este","estos","estas","hay","tiene","tienen","tengo","me","mi","tu","su","les","nos","se","lo","le","y","o","u","a",
]);
const SYNONYM_GROUPS = [
  ["ubicacion","ubicado","ubicados","ubicada","ubicadas","direccion","direcciones","domicilio","localizacion","queda","quedan","sede","lugar","sitio","mapa","donde"],
  ["horario","horarios","hora","horas","atencion","abre","abren","cierra","cierran","apertura"],
  ["precio","precios","costo","costos","cuesta","cuestan","valor","tarifa","tarifas","pago","pagos","cuanto"],
  ["tratamiento","tratamientos","servicio","servicios","procedimiento","procedimientos","ofrecen","ofrecer","disponible","disponibles"],
  ["turno","turnos","cita","citas","consulta","agendar","reservar","sacar"],
  ["contacto","contactar","telefono","whatsapp","email","correo","mail"],
  ["medicamento","medicamentos","medicina","farmaco","farmacos","receta","diagnostico","sintoma","sintomas"],
];
const SYNONYM_LOOKUP = new Map();
for (const group of SYNONYM_GROUPS) {
  const set = new Set(group);
  for (const word of group) SYNONYM_LOOKUP.set(word, set);
}
function normalizeText(value) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ñ/g, "n");
}
function tokenize(value, keepStopwords = false) {
  const parts = normalizeText(value).split(/[^a-z0-9]+/).map((p) => p.trim()).filter((p) => p.length >= 3);
  return keepStopwords ? parts : parts.filter((p) => !STOPWORDS.has(p));
}
function expandToken(token) {
  const out = new Set([token]);
  const group = SYNONYM_LOOKUP.get(token);
  if (group) for (const syn of group) out.add(syn);
  if (token.endsWith("es") && token.length > 4) out.add(token.slice(0, -2));
  if (token.endsWith("s") && token.length > 3) out.add(token.slice(0, -1));
  return out;
}
function sharesStem(a, b) {
  if (a === b) return true;
  if (a.length < 6 || b.length < 6) return false;
  return a.slice(0, Math.min(6, Math.min(a.length, b.length))) ===
    b.slice(0, Math.min(6, Math.min(a.length, b.length)));
}
function scoreTokenAgainstHaystack(token, haystack, haystackTokens) {
  let best = 0;
  for (const variant of expandToken(token)) {
    if (haystack.includes(variant)) best = Math.max(best, variant === token ? 2 : 1.5);
    for (const ht of haystackTokens) if (sharesStem(variant, ht)) best = Math.max(best, 1.25);
  }
  return best;
}
function rankDetailed(entries, query, limit = 5) {
  let effectiveTokens = tokenize(query);
  if (effectiveTokens.length === 0) effectiveTokens = tokenize(query, true);
  const locationIntent = effectiveTokens.some((token) =>
    [...expandToken(token)].some((variant) =>
      ["ubicacion","direccion","queda","quedan","ubicado","ubicados","horario","horarios","contacto","telefono","whatsapp"].includes(variant),
    ),
  );
  return entries.map((entry) => {
    const titleNorm = normalizeText(entry.title);
    const contentNorm = normalizeText(entry.content);
    const categoryNorm = normalizeText(entry.category);
    const haystack = `${titleNorm}\n${contentNorm}\n${categoryNorm}`;
    const titleTokens = tokenize(entry.title, true);
    const contentTokens = tokenize(entry.content, true);
    let score = 0;
    let originalHits = 0;
    for (const token of effectiveTokens) {
      const titleHit = scoreTokenAgainstHaystack(token, titleNorm, titleTokens);
      const contentHit = scoreTokenAgainstHaystack(token, contentNorm, contentTokens);
      const categoryHit = scoreTokenAgainstHaystack(token, categoryNorm, [categoryNorm]);
      if (titleHit > 0) { score += titleHit * 3; originalHits += 1; }
      else if (contentHit > 0) { score += contentHit; originalHits += 1; }
      else if (categoryHit > 0) { score += categoryHit * 1.5; originalHits += 1; }
      else if ([...expandToken(token)].some((v) => haystack.includes(v))) { score += 1; originalHits += 1; }
    }
    if (originalHits >= 2) score += 2;
    if (locationIntent && /ubicacion|horario|contacto|direccion/.test(titleNorm)) score += 5;
    return { entry, score: Number(score.toFixed(2)) };
  }).filter((i) => i.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}

function reconcile(result, knowledgeCount) {
  const combined = `${result.reply}\n${result.handoff_reason ?? ""}`;
  const lacks = /no tengo (la )?informaci[oó]n|falta (de )?informaci[oó]n|sin informaci[oó]n|informaci[oó]n cr[ií]tica/i.test(combined);
  if ((knowledgeCount === 0 && result.should_handoff) || lacks) {
    if (result.confidence === "high") result.confidence = "low";
  }
  return result;
}

const QUESTIONS = [
  "¿Dónde están ubicados?",
  "¿Qué horario tienen?",
  "¿Cuánto cuesta la rinomodelación?",
  "¿Qué tratamientos ofrecen?",
  "¿Qué medicamento me recomiendan para el dolor?",
];

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("FAIL=missing OPENAI_API_KEY");
  process.exit(1);
}

const client = process.env.DATABASE_URL
  ? new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
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
  const settings = await client.query(
    `select * from public.ai_agent_settings where business_id = $1`,
    [BUSINESS_ID],
  );
  const knowledge = await client.query(
    `select * from public.ai_knowledge_entries where business_id = $1 and enabled = true`,
    [BUSINESS_ID],
  );
  const s = settings.rows[0];
  console.log(`AGENT_ENABLED=${s.enabled}`);

  for (const q of QUESTIONS) {
    const ranked = rankDetailed(knowledge.rows, q, 5);
    const knowledgeBlock = ranked.length === 0
      ? "(Sin entradas de conocimiento relevantes.)"
      : ranked.map((item, i) => `[${i + 1}] ${item.entry.title} (${item.entry.category})\n${item.entry.content}`).join("\n\n");

    const systemPrompt = `Eres ${s.agent_name}, asistente comercial de ${s.business_name}.
Descripción: ${s.business_description}
Instrucciones:
${s.system_instructions}
${s.human_handoff_enabled ? `Handoff: ${s.human_handoff_instructions}` : ""}
Reglas: no inventes precios/horarios/ubicaciones. Solo usa la base de conocimiento.
Base de conocimiento relevante:
${knowledgeBlock}
Responde SOLO JSON: {"reply":"...","should_handoff":false,"handoff_reason":null,"confidence":"high"}
Si faltan datos, confidence debe ser low (nunca high) y should_handoff=true.`;

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
    const json = await response.json();
    if (!response.ok) {
      console.log(`\nQUERY=${q}`);
      console.log(`OPENAI_ERROR=${json.error?.message ?? response.status}`);
      continue;
    }
    let parsed = JSON.parse(json.choices[0].message.content);
    parsed = reconcile(parsed, ranked.length);
    console.log(`\nQUERY=${q}`);
    console.log(`SELECTED=${JSON.stringify(ranked.map((r) => ({ title: r.entry.title, score: r.score })))}`);
    console.log(`REPLY=${parsed.reply}`);
    console.log(`CONFIDENCE=${parsed.confidence}`);
    console.log(`HANDOFF=${parsed.should_handoff}`);
    console.log(`REASON=${parsed.handoff_reason}`);
  }
} finally {
  await client.end();
}
