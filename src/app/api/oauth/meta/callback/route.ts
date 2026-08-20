import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { META_OAUTH_STATE_COOKIE } from "@/lib/meta/oauth-state";
import { handleMetaOAuthCallback } from "@/services/whatsapp/meta-oauth.service";

export const runtime = "nodejs";

/**
 * Callback OAuth de Meta (URI de redireccionamiento válida).
 * GET /api/oauth/meta/callback
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const cookieStore = await cookies();

  try {
    return await handleMetaOAuthCallback({
      code: params.get("code"),
      state: params.get("state"),
      error: params.get("error"),
      errorDescription: params.get("error_description"),
      stateCookie: cookieStore.get(META_OAUTH_STATE_COOKIE)?.value ?? null,
    });
  } catch {
    return NextResponse.redirect(
      new URL(
        "/configuracion?tab=integraciones&whatsapp=error&reason=callback_fallido",
        process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      ),
    );
  }
}
