/**
 * Read-only audit: CLINICA PASTORE auth user + membership.
 * No mutations. No secrets printed.
 */
import fs from "node:fs";
import pg from "pg";

function loadEnvLocal() {
  const envPath = ".env.local";
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const i = s.indexOf("=");
    if (i <= 0) continue;
    const k = s.slice(0, i).trim();
    let v = s.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnvLocal();

const EMAIL = "esteticaconsultas@gmail.com";
const BUSINESS_ID = "ee05dfbd-839b-4f52-be6f-327080995e56";
const EXPECTED_USER_ID = "5696a882-1191-4383-8456-c0c1b30b2143";

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
  const authUser = await client.query(
    `select id, email, email_confirmed_at is not null as email_confirmed,
            banned_until, deleted_at, created_at, last_sign_in_at,
            raw_app_meta_data->>'provider' as provider
     from auth.users
     where lower(email) = lower($1)`,
    [EMAIL],
  );

  console.log("AUTH_USER_COUNT=" + authUser.rowCount);
  if (authUser.rowCount > 0) {
    const u = authUser.rows[0];
    console.log(
      "AUTH_USER=" +
        JSON.stringify({
          id: u.id,
          email: u.email,
          email_confirmed: u.email_confirmed,
          banned_until: u.banned_until,
          deleted_at: u.deleted_at,
          provider: u.provider,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          matches_expected_id: u.id === EXPECTED_USER_ID,
        }),
    );
  }

  const identities = await client.query(
    `select provider, provider_id is not null as has_provider_id
     from auth.identities
     where user_id = (select id from auth.users where lower(email)=lower($1) limit 1)`,
    [EMAIL],
  );
  console.log("IDENTITIES=" + JSON.stringify(identities.rows));

  const membership = await client.query(
    `select bu.user_id, bu.business_id, bu.role, b.name, b.slug
     from public.business_users bu
     join public.businesses b on b.id = bu.business_id
     where bu.user_id = (select id from auth.users where lower(email)=lower($1) limit 1)`,
    [EMAIL],
  );
  console.log("MEMBERSHIPS=" + JSON.stringify(membership.rows));
  console.log(
    "LINKED_TO_PASTORE=" +
      String(
        membership.rows.some((r) => r.business_id === BUSINESS_ID),
      ),
  );

  const business = await client.query(
    `select id, name, slug from public.businesses where id = $1`,
    [BUSINESS_ID],
  );
  console.log("BUSINESS=" + JSON.stringify(business.rows[0] ?? null));

  const envHints = {
    has_supabase_url: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    has_publishable_key: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
    has_service_role: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    app_url: process.env.NEXT_PUBLIC_APP_URL || null,
  };
  console.log("LOCAL_ENV_HINTS=" + JSON.stringify(envHints));
} finally {
  await client.end();
}
