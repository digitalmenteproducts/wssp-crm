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
  coexistence: z.boolean().optional(),
});

/**
 * Completa Embedded Signup desde el cliente (Meta JS SDK).
 * POST /api/oauth/meta/complete
 * Body: { code, state, waba_id?, phone_number_id?, coexistence? }
 * Nunca acepta business_id del cliente.
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
      coexistence: parsed.data.coexistence ?? false,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    const response = NextResponse.json({
      ok: true,
      message: result.message,
      waba_id: result.wabaId,
      phone_number_id: result.phoneNumberId,
      display_phone: result.displayPhone,
      coexistence: result.coexistence,
    });

    response.cookies.set(META_OAUTH_STATE_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "No se pudo completar la conexión." },
      { status: 500 },
    );
  }
}
