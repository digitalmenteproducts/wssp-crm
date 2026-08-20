import { NextResponse } from "next/server";

import { startMetaOAuth } from "@/services/whatsapp/meta-oauth.service";

export const runtime = "nodejs";

/**
 * Inicia OAuth Meta / preparación Embedded Signup.
 * GET /api/oauth/meta/start
 */
export async function GET() {
  try {
    return await startMetaOAuth();
  } catch {
    return NextResponse.redirect(
      new URL("/configuracion?tab=integraciones&whatsapp=error&reason=start_fallido", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
    );
  }
}
