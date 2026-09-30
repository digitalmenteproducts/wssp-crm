/**
 * Tests de seguridad de business_secrets.
 * Uso: npx tsx scripts/test-business-secrets-security.mts
 *
 * - Nunca imprime valores de secretos (solo PASS/FAIL y conteos).
 * - Las simulaciones de rol y la re-ejecución de la fase 2 van en transacciones con ROLLBACK.
 * - No envía WhatsApp, no crea campañas, no activa agentes, no toca citas.
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
    if (!value) continue;
    if (!(key in process.env) || !process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

const SECRET_COLUMNS = [
  "openai_api_key",
  "whatsapp_access_token",
  "whatsapp_verify_token",
];

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`PASS ${name}`);
    passed += 1;
  } else {
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
    failed += 1;
  }
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});
await client.connect();

async function asUser<T>(
  userId: string | null,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query("begin");
  try {
    if (userId) {
      await client.query(
        `select set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ sub: userId, role: "authenticated" })],
      );
      await client.query("set local role authenticated");
    } else {
      await client.query(
        `select set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ role: "anon" })],
      );
      await client.query("set local role anon");
    }
    return await fn();
  } finally {
    await client.query("rollback");
  }
}

async function queryError(sql: string, params: unknown[] = []) {
  try {
    const result = await client.query(sql, params);
    return { code: null as string | null, rows: result.rowCount ?? 0 };
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String((error as { code: unknown }).code)
        : "unknown";
    return { code, rows: 0 };
  }
}

try {
  // -------------------------------------------------------------------------
  // Contexto: negocio con secretos y usuarios de prueba (sin imprimir valores)
  // -------------------------------------------------------------------------
  const target = await client.query<{ business_id: string }>(
    `select business_id from public.business_secrets
     where whatsapp_access_token is not null or openai_api_key is not null
     limit 1`,
  );
  const businessId = target.rows[0]?.business_id;
  assert("setup: existe un negocio con secretos migrados", Boolean(businessId));

  const member = await client.query<{ user_id: string }>(
    `select user_id from public.business_users where business_id = $1 limit 1`,
    [businessId],
  );
  const memberId = member.rows[0]?.user_id;
  const outsider = await client.query<{ user_id: string }>(
    `select user_id from public.business_users
     where user_id not in (select user_id from public.business_users where business_id = $1)
     limit 1`,
    [businessId],
  );
  const outsiderId = outsider.rows[0]?.user_id;
  assert("setup: miembro del negocio encontrado", Boolean(memberId));
  assert("setup: usuario de otro negocio encontrado", Boolean(outsiderId));

  // -------------------------------------------------------------------------
  // Estructura: RLS activo, sin policies y sin grants para anon/authenticated
  // -------------------------------------------------------------------------
  const rls = await client.query<{ relrowsecurity: boolean }>(
    `select relrowsecurity from pg_class where oid = 'public.business_secrets'::regclass`,
  );
  assert("RLS activo en business_secrets", rls.rows[0]?.relrowsecurity === true);

  const policies = await client.query(
    `select 1 from pg_policies where schemaname = 'public' and tablename = 'business_secrets'`,
  );
  assert("business_secrets sin policies", policies.rowCount === 0);

  const grants = await client.query<{ grantee: string; privilege_type: string }>(
    `select grantee, privilege_type from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'business_secrets'
       and grantee in ('anon', 'authenticated', 'PUBLIC')`,
  );
  assert(
    "business_secrets sin grants para anon/authenticated/PUBLIC",
    grants.rowCount === 0,
    grants.rows.map((r) => `${r.grantee}:${r.privilege_type}`).join(","),
  );

  // -------------------------------------------------------------------------
  // CASO 1: miembro authenticated no puede leer ni escribir business_secrets
  // -------------------------------------------------------------------------
  if (memberId && businessId) {
    await asUser(memberId, async () => {
      const r = await queryError(
        `select whatsapp_access_token from public.business_secrets where business_id = $1`,
        [businessId],
      );
      assert("CASO 1: miembro SELECT business_secrets → permission denied", r.code === "42501", `code=${r.code}`);
    });
    await asUser(memberId, async () => {
      const r = await queryError(
        `update public.business_secrets set openai_api_key = 'x' where business_id = $1`,
        [businessId],
      );
      assert("CASO 1: miembro UPDATE business_secrets → permission denied", r.code === "42501", `code=${r.code}`);
    });
    await asUser(memberId, async () => {
      const r = await queryError(
        `insert into public.business_secrets (business_id) values ($1)`,
        [businessId],
      );
      assert("CASO 1: miembro INSERT business_secrets → permission denied", r.code === "42501", `code=${r.code}`);
    });
    await asUser(memberId, async () => {
      const r = await queryError(
        `delete from public.business_secrets where business_id = $1`,
        [businessId],
      );
      assert("CASO 1: miembro DELETE business_secrets → permission denied", r.code === "42501", `code=${r.code}`);
    });
  }

  // -------------------------------------------------------------------------
  // CASO 2: usuario de otro negocio
  // -------------------------------------------------------------------------
  if (outsiderId && businessId) {
    await asUser(outsiderId, async () => {
      const r = await queryError(
        `select * from public.business_secrets where business_id = $1`,
        [businessId],
      );
      assert("CASO 2: otro negocio SELECT business_secrets → permission denied", r.code === "42501", `code=${r.code}`);
    });
    await asUser(outsiderId, async () => {
      const r = await client.query(
        `select business_id from public.business_settings where business_id = $1`,
        [businessId],
      );
      assert("CASO 2: otro negocio no ve business_settings ajeno (RLS)", r.rowCount === 0);
    });
  }

  // -------------------------------------------------------------------------
  // CASO 3: anónimo (rol anon en Postgres y API REST real con publishable key)
  // -------------------------------------------------------------------------
  await asUser(null, async () => {
    const r = await queryError(`select * from public.business_secrets limit 1`);
    assert("CASO 3: anon SELECT business_secrets → permission denied", r.code === "42501", `code=${r.code}`);
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (url && publishable) {
    const res = await fetch(`${url}/rest/v1/business_secrets?select=business_id&limit=1`, {
      headers: { apikey: publishable, Authorization: `Bearer ${publishable}` },
    });
    const body = await res.text();
    const leaked = SECRET_COLUMNS.some((c) => body.includes(c)) || body.startsWith("[{");
    assert(
      "CASO 3: REST anon /business_secrets rechazado",
      !res.ok && !leaked,
      `status=${res.status}`,
    );
  } else {
    assert("CASO 3: REST anon (faltan env públicas)", false);
  }

  // -------------------------------------------------------------------------
  // CASO 4: backend con service role obtiene lo necesario (repositorio real)
  // -------------------------------------------------------------------------
  if (businessId) {
    const repo = await import("../src/repositories/business-secrets.repository");
    const raw = await client.query<{
      openai_api_key: string | null;
      whatsapp_access_token: string | null;
    }>(
      `select openai_api_key, whatsapp_access_token from public.business_secrets where business_id = $1`,
      [businessId],
    );
    const expected = raw.rows[0];

    const wa = await repo.getWhatsAppCredentials(businessId);
    assert("CASO 4: getWhatsAppCredentials sin error", wa.error === null);
    assert(
      "CASO 4: service role obtiene el access token correcto",
      wa.error === null && wa.data.accessToken === expected?.whatsapp_access_token,
    );

    const ai = await repo.getOpenAICredentials(businessId);
    assert(
      "CASO 4: service role obtiene la OpenAI key correcta",
      ai.error === null && ai.data.apiKey === expected?.openai_api_key,
    );

    const status = await repo.getSecretsStatus(businessId);
    const statusJson = JSON.stringify(status.data ?? {});
    assert(
      "CASO 6: getSecretsStatus (lo que llega a la UI) no contiene valores de secretos",
      status.error === null &&
        [expected?.openai_api_key, expected?.whatsapp_access_token]
          .filter((v): v is string => Boolean(v && v.length > 4))
          .every((v) => !statusJson.includes(v)),
    );
    assert(
      "CASO 6: getSecretsStatus expone solo flags/hints",
      status.error === null &&
        Object.keys(status.data).every((k) => k.endsWith("_set") || k.endsWith("_hint")),
    );
  }

  // -------------------------------------------------------------------------
  // CASO 5: business_settings devuelve lo operativo y no contiene secretos
  // -------------------------------------------------------------------------
  if (memberId && businessId) {
    await asUser(memberId, async () => {
      const r = await client.query(
        `select business_id, whatsapp_phone_number_id, whatsapp_connection_status,
                classification_prompt, ai_engine_enabled
         from public.business_settings where business_id = $1`,
        [businessId],
      );
      assert("CASO 5: miembro lee configuración operativa", r.rowCount === 1);
    });

    await asUser(memberId, async () => {
      const r = await client.query(
        `select * from public.business_settings where business_id = $1`,
        [businessId],
      );
      const cols = r.fields.map((f) => f.name);
      assert("CASO 5: miembro SELECT * business_settings funciona", r.rowCount === 1);
      assert(
        "CASO 5: SELECT * de business_settings sin columnas secretas",
        SECRET_COLUMNS.every((c) => !cols.includes(c)),
        cols.join(","),
      );
      assert(
        "CASO 5: conserva columnas operativas",
        ["whatsapp_phone_number_id", "whatsapp_business_account_id", "whatsapp_connection_status", "whatsapp_display_phone", "ai_engine_enabled", "classification_prompt"].every((c) => cols.includes(c)),
      );
    });
  }

  const legacyCols = await client.query(
    `select count(*)::int as c from information_schema.columns
     where table_schema = 'public' and table_name = 'business_settings'
       and column_name = any($1)`,
    [SECRET_COLUMNS],
  );
  assert("CASO 5: esquema de business_settings sin columnas legacy de secretos", legacyCols.rows[0].c === 0);

  const syncArtifacts = await client.query(
    `select
       (select count(*)::int from pg_trigger where tgname = 'business_settings_sync_legacy_secrets') as trg,
       (select count(*)::int from pg_proc where proname = 'sync_legacy_business_secrets') as fn`,
  );
  assert(
    "trigger/función de sincronización legacy eliminados",
    syncArtifacts.rows[0].trg === 0 && syncArtifacts.rows[0].fn === 0,
  );

  const phase2 = fs.readFileSync(
    path.join(
      "supabase",
      "migrations",
      "20260930130000_business_settings_drop_legacy_secrets.sql",
    ),
    "utf8",
  );
  await client.query("begin");
  try {
    await client.query("set local lock_timeout = '3s'");
    const r = await queryError(phase2);
    assert("migración fase 2 re-ejecutable sin error (idempotente)", r.code === null, `code=${r.code}`);
    const secretsRows = await client.query(`select count(*)::int as c from public.business_secrets`);
    assert("re-ejecución de fase 2 no altera business_secrets", secretsRows.rows[0].c > 0);
  } finally {
    await client.query("rollback");
  }

  // -------------------------------------------------------------------------
  // CASO 6: análisis estático de lo que puede llegar a Client Components
  // -------------------------------------------------------------------------
  function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });
  }
  const files = walk("src").map((file) => ({
    file,
    text: fs.readFileSync(file, "utf8"),
  }));

  const rawSecretRef = /\b(openai_api_key|whatsapp_access_token|whatsapp_verify_token)\b(?!_(set|hint))/;
  const clientFiles = files.filter((f) => /^\s*["']use client["']/m.test(f.text));
  const clientLeaks = clientFiles.filter(
    (f) =>
      /business-secrets\.repository|lib\/supabase\/admin/.test(f.text) ||
      f.text
        .split(/\r?\n/)
        .some((line) => rawSecretRef.test(line) && !/name=|htmlFor=|id=/.test(line)),
  );
  assert(
    "CASO 6: ningún Client Component importa secretos/admin ni lee valores crudos",
    clientLeaks.length === 0,
    clientLeaks.map((f) => f.file).join(", "),
  );

  const typesText = fs.readFileSync(path.join("src", "types", "business.ts"), "utf8");
  const publicBlock = typesText.slice(typesText.indexOf("export type BusinessSettingsPublic"));
  const publicType = publicBlock.slice(0, publicBlock.indexOf("};"));
  assert(
    "CASO 6: BusinessSettingsPublic no declara secretos crudos",
    !rawSecretRef.test(publicType),
  );

  const secretsAccess = files.filter(
    (f) => /from\(\s*["']business_secrets["']\s*\)/.test(f.text),
  );
  assert(
    "acceso a business_secrets centralizado en el repositorio",
    secretsAccess.length === 1 &&
      secretsAccess[0].file.replace(/\\/g, "/").endsWith("repositories/business-secrets.repository.ts"),
    secretsAccess.map((f) => f.file).join(", "),
  );

  const settingsSelectStar = files.filter((f) =>
    /from\(\s*["']business_settings["']\s*\)[\s\S]{0,200}?\.select\(\s*["']\*["']\s*\)/.test(f.text),
  );
  assert(
    "sin select(\"*\") sobre business_settings",
    settingsSelectStar.length === 0,
    settingsSelectStar.map((f) => f.file).join(", "),
  );

  const legacySecretReads = files.filter(
    (f) =>
      !f.file.replace(/\\/g, "/").endsWith("repositories/business-secrets.repository.ts") &&
      /from\(\s*["']business_settings["']\s*\)[\s\S]{0,300}?(openai_api_key|whatsapp_access_token|whatsapp_verify_token)/.test(f.text),
  );
  assert(
    "ningún archivo lee secretos desde business_settings",
    legacySecretReads.length === 0,
    legacySecretReads.map((f) => f.file).join(", "),
  );

  // -------------------------------------------------------------------------
  // Guardas: agente de Pastore sigue desactivado
  // -------------------------------------------------------------------------
  const agent = await client.query<{ enabled: boolean }>(
    `select enabled from public.ai_agent_settings where business_id = 'ee05dfbd-839b-4f52-be6f-327080995e56'`,
  );
  assert("Pastore: agente IA sigue desactivado", agent.rows[0]?.enabled === false);
} finally {
  await client.end();
}

console.log(`\nRESULT passed=${passed} failed=${failed}`);
process.exit(failed > 0 ? 1 : 0);
