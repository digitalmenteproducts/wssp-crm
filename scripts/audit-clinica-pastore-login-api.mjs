/**
 * Read-only: probe Supabase Auth health + user existence via Admin API.
 * Prints no secrets.
 */
import fs from "node:fs";

function loadEnvLocal() {
  if (!fs.existsSync(".env.local")) return;
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = "esteticaconsultas@gmail.com";
const expectedId = "5696a882-1191-4383-8456-c0c1b30b2143";
const businessId = "ee05dfbd-839b-4f52-be6f-327080995e56";

console.log(
  "ENV=" +
    JSON.stringify({
      has_url: Boolean(url),
      url_host: url ? new URL(url).host : null,
      has_anon: Boolean(anon),
      anon_len: anon?.length ?? 0,
      has_service: Boolean(service),
      has_database_url: Boolean(process.env.DATABASE_URL),
      app_url: process.env.NEXT_PUBLIC_APP_URL ?? null,
    }),
);

if (!url || !anon) {
  console.log("FAIL=missing public supabase env");
  process.exit(1);
}

// 1) Auth health / settings (anon)
const health = await fetch(`${url}/auth/v1/health`, {
  headers: { apikey: anon },
});
console.log(
  "AUTH_HEALTH=" +
    JSON.stringify({ status: health.status, ok: health.ok }),
);
try {
  const body = await health.text();
  console.log("AUTH_HEALTH_BODY=" + body.slice(0, 200));
} catch {
  console.log("AUTH_HEALTH_BODY=(unreadable)");
}

// 2) Sign-in probe with deliberately wrong password to see Auth reachability
//    (does NOT use real password; checks if Auth responds)
const badLogin = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: {
    apikey: anon,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    email,
    password: "__audit_invalid_password__",
  }),
});
const badJson = await badLogin.json().catch(() => ({}));
console.log(
  "BAD_LOGIN_PROBE=" +
    JSON.stringify({
      status: badLogin.status,
      error_code: badJson.error_code ?? badJson.error ?? null,
      msg: typeof badJson.msg === "string" ? badJson.msg.slice(0, 120) : null,
      error_description:
        typeof badJson.error_description === "string"
          ? badJson.error_description.slice(0, 120)
          : null,
    }),
);

if (!service) {
  console.log("SKIP_ADMIN=missing service role");
  process.exit(0);
}

// 3) Admin list user by email
const listed = await fetch(
  `${url}/auth/v1/admin/users?page=1&per_page=200`,
  {
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
    },
  },
);
const listedJson = await listed.json().catch(() => ({}));
console.log(
  "ADMIN_LIST=" +
    JSON.stringify({
      status: listed.status,
      ok: listed.ok,
      message: listedJson.message ?? listedJson.msg ?? null,
      user_count: Array.isArray(listedJson.users)
        ? listedJson.users.length
        : null,
    }),
);

const user = Array.isArray(listedJson.users)
  ? listedJson.users.find(
      (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
    )
  : null;

if (!user) {
  console.log("USER_EXISTS=false");
} else {
  console.log(
    "USER_EXISTS=true " +
      JSON.stringify({
        id: user.id,
        email: user.email,
        email_confirmed: Boolean(user.email_confirmed_at),
        banned_until: user.banned_until ?? null,
        last_sign_in_at: user.last_sign_in_at ?? null,
        created_at: user.created_at ?? null,
        matches_expected_id: user.id === expectedId,
        providers: user.app_metadata?.providers ?? null,
      }),
  );
}

// 4) Membership via PostgREST (service role)
const membership = await fetch(
  `${url}/rest/v1/business_users?select=user_id,business_id,role,businesses(name,slug)&user_id=eq.${encodeURIComponent(user?.id ?? expectedId)}`,
  {
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      Accept: "application/json",
    },
  },
);
const membershipJson = await membership.json().catch(() => []);
console.log(
  "MEMBERSHIP_STATUS=" +
    JSON.stringify({ status: membership.status, ok: membership.ok }),
);
console.log("MEMBERSHIPS=" + JSON.stringify(membershipJson));
const linked = Array.isArray(membershipJson)
  ? membershipJson.some((row) => row.business_id === businessId)
  : false;
console.log("LINKED_TO_PASTORE=" + String(linked));

const business = await fetch(
  `${url}/rest/v1/businesses?select=id,name,slug&id=eq.${businessId}`,
  {
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      Accept: "application/json",
    },
  },
);
const businessJson = await business.json().catch(() => []);
console.log("BUSINESS=" + JSON.stringify(businessJson));
