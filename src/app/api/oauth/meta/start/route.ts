import { NextResponse, type NextRequest } from "next/server";

import {
  prepareEmbeddedSignup,
  settingsRedirect,
} from "@/services/whatsapp/meta-oauth.service";

export const runtime = "nodejs";

/**
 * Prepara Embedded Signup (JSON).
 * GET /api/oauth/meta/start
 * Preferir Accept: application/json desde el SDK client.
 */
export async function GET(request: NextRequest) {
  const wantsJson =
    request.nextUrl.searchParams.get("format") === "json" ||
    (request.headers.get("accept") ?? "").includes("application/json");

  try {
    if (wantsJson) {
      const prepared = await prepareEmbeddedSignup();
      if (!prepared.ok) {
        return NextResponse.json(
          { ok: false, error: prepared.error },
          { status: prepared.status },
        );
      }
      return prepared.response;
    }

    return NextResponse.redirect(
      settingsRedirect("error", "usar_boton_conectar"),
    );
  } catch {
    if (wantsJson) {
      return NextResponse.json(
        { ok: false, error: "No se pudo preparar Embedded Signup." },
        { status: 500 },
      );
    }
    return NextResponse.redirect(settingsRedirect("error", "start_fallido"));
  }
}
