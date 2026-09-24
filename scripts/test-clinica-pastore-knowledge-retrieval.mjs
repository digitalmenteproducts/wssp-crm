/**
 * Prueba offline de recuperación de conocimiento CLINICA PASTORE.
 * Uso: node scripts/test-clinica-pastore-knowledge-retrieval.mjs
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const STOPWORDS = new Set([
  "que","cual","cuales","como","donde","cuando","quien","quienes","por","para","con","sin",
  "una","uno","unos","unas","los","las","del","de","la","el","al","en","es","son","esta","estan",
  "este","estos","estas","hay","tiene","tienen","tengo","hola","buenas","buen","dia","tardes",
  "noches","porfa","porfavor","favor","me","mi","tu","su","les","nos","se","lo","le","y","o","u","a",
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
    for (const ht of haystackTokens) {
      if (sharesStem(variant, ht)) best = Math.max(best, 1.25);
    }
  }
  return best;
}

function rank(entries, query, limit = 5) {
  let effectiveTokens = tokenize(query);
  if (effectiveTokens.length === 0) effectiveTokens = tokenize(query, true);
  if (effectiveTokens.length === 0) {
    return entries.slice(0, limit).map((e) => ({ title: e.title, score: 0 }));
  }

  const locationIntent = effectiveTokens.some((token) =>
    [...expandToken(token)].some((variant) =>
      [
        "ubicacion",
        "direccion",
        "queda",
        "quedan",
        "ubicado",
        "ubicados",
        "horario",
        "horarios",
        "contacto",
        "telefono",
        "whatsapp",
      ].includes(variant),
    ),
  );

  return entries
    .map((entry) => {
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
        const contentHit = scoreTokenAgainstHaystack(
          token,
          contentNorm,
          contentTokens,
        );
        const categoryHit = scoreTokenAgainstHaystack(token, categoryNorm, [
          categoryNorm,
        ]);
        if (titleHit > 0) {
          score += titleHit * 3;
          originalHits += 1;
        } else if (contentHit > 0) {
          score += contentHit;
          originalHits += 1;
        } else if (categoryHit > 0) {
          score += categoryHit * 1.5;
          originalHits += 1;
        } else if ([...expandToken(token)].some((v) => haystack.includes(v))) {
          score += 1;
          originalHits += 1;
        }
      }
      if (originalHits >= 2) score += 2;
      if (
        locationIntent &&
        /ubicacion|horario|contacto|direccion/.test(titleNorm)
      ) {
        score += 5;
      }
      return {
        title: entry.title,
        category: entry.category,
        score: Number(score.toFixed(2)),
      };
    })
    .filter((i) => i.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const BUSINESS_ID = "ee05dfbd-839b-4f52-be6f-327080995e56";
const QUERIES = [
  "¿Dónde están ubicados?",
  "¿Cuál es la dirección?",
  "¿Qué horario tienen?",
  "¿Dónde queda la clínica?",
  "¿Cuánto cuesta la rinomodelación?",
  "¿Qué tratamientos ofrecen?",
  "¿Qué medicamento me recomiendan para dolor?",
];

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
  const rows = await client.query(
    `select title, content, category, enabled, business_id
     from public.ai_knowledge_entries
     where business_id = $1
     order by title`,
    [BUSINESS_ID],
  );
  console.log(`ENTRIES=${rows.rowCount}`);
  console.log(
    `ENABLED_ALL=${rows.rows.every((r) => r.enabled)}`,
  );
  console.log(
    `HAS_UBICACION=${rows.rows.some((r) => r.title === "Ubicación, horario y contacto")}`,
  );

  const agent = await client.query(
    `select enabled from public.ai_agent_settings where business_id = $1`,
    [BUSINESS_ID],
  );
  const wa = await client.query(
    `select whatsapp_connection_status, whatsapp_phone_number_id is null as no_phone
     from public.business_settings where business_id = $1`,
    [BUSINESS_ID],
  );
  console.log(`AGENT_ENABLED=${agent.rows[0]?.enabled}`);
  console.log(`WHATSAPP=${JSON.stringify(wa.rows[0])}`);

  const enabled = rows.rows.filter((r) => r.enabled);
  for (const q of QUERIES) {
    const ranked = rank(enabled, q, 5);
    console.log(`\nQUERY=${q}`);
    console.log(`SELECTED=${JSON.stringify(ranked)}`);
  }

  // Old algorithm simulation for diagnosis
  function oldRank(entries, query) {
    const tokens = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9áéíóúñü]+/i).map((p) => p.trim()).filter((p) => p.length >= 3);
    return entries.map((entry) => {
      const haystack = `${entry.title}\n${entry.content}\n${entry.category}`.toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (haystack.includes(token)) score += entry.title.toLowerCase().includes(token) ? 3 : 1;
      }
      return { title: entry.title, score };
    }).filter((i) => i.score > 0).sort((a, b) => b.score - a.score);
  }
  console.log(`\nOLD_ALG_UBICADOS=${JSON.stringify(oldRank(enabled, "¿Dónde están ubicados?"))}`);
} finally {
  await client.end();
}
