/**
 * Tests: phone normalize + manual contact create path (DB).
 * Uso: npx tsx scripts/test-manual-contact-create.mts
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

import { normalizePhone } from "../src/lib/phone";
import {
  contactSingularLabel,
  contactsNavLabel,
  newContactLabel,
} from "../src/lib/industry";

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

assert(
  "normalize strips symbols",
  normalizePhone("+54 9 381-555-1212") === "5493815551212",
);
assert("normalize digits only", normalizePhone("54911abc") === "54911");
assert("clinic labels", newContactLabel("clinic") === "Nuevo paciente");
assert("clinic singular", contactSingularLabel("clinic") === "Paciente");
assert("other labels", newContactLabel("other") === "Nuevo contacto");
assert("other nav", contactsNavLabel("ecommerce") === "Contactos");

async function dbTests() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  await client.connect();

  try {
    const emailCol = await client.query(`
      select 1 from information_schema.columns
      where table_schema='public' and table_name='contacts' and column_name='email'
    `);
    assert("contacts.email exists", emailCol.rows.length === 1);

    const policy = await client.query(`
      select 1 from pg_policy
      where polrelid = 'public.contacts'::regclass and polname = 'contacts_insert_member'
    `);
    assert("contacts_insert_member policy", policy.rows.length === 1);

    const biz = await client.query(
      `insert into public.businesses (name, slug, industry)
       values ('Manual Contact Test', $1, 'clinic') returning id`,
      [`manual-contact-test-${Date.now()}`],
    );
    const businessId = biz.rows[0].id as string;
    const phone = normalizePhone(`+54 9 381 ${String(Date.now()).slice(-7)}`);

    const inserted = await client.query(
      `insert into public.contacts (business_id, phone, name, email, status)
       values ($1, $2, 'Paciente Prueba', 'prueba@example.com', 'nuevo')
       returning id, phone, email`,
      [businessId, phone],
    );
    assert("manual insert contact", Boolean(inserted.rows[0]?.id));
    assert(
      "phone stored normalized",
      inserted.rows[0].phone === phone,
      inserted.rows[0].phone,
    );
    assert("email stored", inserted.rows[0].email === "prueba@example.com");

    let dupBlocked = false;
    try {
      await client.query(
        `insert into public.contacts (business_id, phone, name, status)
         values ($1, $2, 'Duplicado', 'nuevo')`,
        [businessId, phone],
      );
    } catch {
      dupBlocked = true;
    }
    assert("duplicate phone blocked same business", dupBlocked);

    // No conversation created for this contact
    const conv = await client.query(
      `select count(*)::int as n from public.conversations where contact_id = $1`,
      [inserted.rows[0].id],
    );
    assert("no conversation created", conv.rows[0].n === 0);

    // Appears in listContactsSimple-style query
    const listed = await client.query(
      `select id from public.contacts where business_id = $1 and id = $2`,
      [businessId, inserted.rows[0].id],
    );
    assert("available for agenda selector query", listed.rows.length === 1);

    await client.query(`delete from public.businesses where id = $1`, [
      businessId,
    ]);
    assert("cleanup", true);
  } finally {
    await client.end();
  }
}

await dbTests();
console.log(`\nSUMMARY passed=${passed} failed=${failed}`);
if (failed > 0) process.exit(1);
