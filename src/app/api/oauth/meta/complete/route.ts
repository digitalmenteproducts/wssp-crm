import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { META_OAUTH_STATE_COOKIE } from "@/lib/meta/oauth-state";
import { completeMetaOAuth } from "@/services/whatsapp/meta-oauth.service";

export const runtime = "nodejs";

const bodySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  waba_id: z.string().min(1).optional().nullable(),
  phone_number_id: z.string().min(1).optional().nullable(),
});

/**
 * Completa Embedded Signup desde el cliente (SDK futuro).
 * POST /api/oauth/meta/complete
 * Body JSON: { code, state, waba_id?, phone_number_id? }
 */
export async function POST(request: NextRequest) {
  const cookieStore = await cookies();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload incompleto o inválido." },
      { status: 400 },
    );
  }

  try {
    const result = await completeMetaOAuth({
      code: parsed.data.code,
      state: parsed.data.state,
      stateCookie: cookieStore.get(META_OAUTH_STATE_COOKIE)?.value ?? null,
      wabaId: parsed.data.waba_id,
      phoneNumberId: parsed.data.phone_number_id,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    return NextResponse.json({ ok: true, message: result.message });
  } catch {
    return NextResponse.json(
      { error: "No se pudo completar la conexión." },
      { status: 500 },
    );
  }
}
