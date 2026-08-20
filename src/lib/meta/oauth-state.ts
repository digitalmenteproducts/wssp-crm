import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { getOptionalServerEnv } from "@/lib/env";

export const META_OAUTH_STATE_COOKIE = "wcrm_meta_oauth_state";
export const META_OAUTH_STATE_TTL_SECONDS = 60 * 10;

export type MetaOAuthStatePayload = {
  userId: string;
  businessId: string;
  nonce: string;
  exp: number;
};

function getStateSecret(): string {
  const secret = getOptionalServerEnv().META_APP_SECRET;
  if (!secret) {
    throw new Error("META_APP_SECRET no configurado.");
  }
  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", getStateSecret()).update(value).digest("base64url");
}

export function createMetaOAuthState(input: {
  userId: string;
  businessId: string;
}): { token: string; payload: MetaOAuthStatePayload } {
  const payload: MetaOAuthStatePayload = {
    userId: input.userId,
    businessId: input.businessId,
    nonce: randomBytes(16).toString("hex"),
    exp: Math.floor(Date.now() / 1000) + META_OAUTH_STATE_TTL_SECONDS,
  };

  const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const token = `${body}.${sign(body)}`;
  return { token, payload };
}

export function verifyMetaOAuthState(
  token: string | null | undefined,
):
  | { ok: true; payload: MetaOAuthStatePayload }
  | { ok: false; error: string } {
  if (!token || !token.includes(".")) {
    return { ok: false, error: "State OAuth ausente o inválido." };
  }

  const [body, signature] = token.split(".");
  if (!body || !signature) {
    return { ok: false, error: "State OAuth malformado." };
  }

  let expected: string;
  try {
    expected = sign(body);
  } catch {
    return { ok: false, error: "META_APP_SECRET no configurado." };
  }

  const receivedBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (
    receivedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(receivedBuf, expectedBuf)
  ) {
    return { ok: false, error: "State OAuth no coincide." };
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as MetaOAuthStatePayload;

    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.businessId !== "string" ||
      typeof parsed.nonce !== "string" ||
      typeof parsed.exp !== "number"
    ) {
      return { ok: false, error: "State OAuth incompleto." };
    }

    if (parsed.exp < Math.floor(Date.now() / 1000)) {
      return { ok: false, error: "State OAuth expirado." };
    }

    return { ok: true, payload: parsed };
  } catch {
    return { ok: false, error: "State OAuth no se pudo decodificar." };
  }
}

export function statesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
