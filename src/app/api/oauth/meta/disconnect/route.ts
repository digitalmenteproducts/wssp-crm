import { NextResponse } from "next/server";

import { disconnectWhatsAppForCurrentBusiness } from "@/services/whatsapp/meta-oauth.service";

export const runtime = "nodejs";

/**
 * Desconecta WhatsApp de la empresa activa (no acepta business_id).
 * POST /api/oauth/meta/disconnect
 */
export async function POST() {
  try {
    const result = await disconnectWhatsAppForCurrentBusiness();
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: result.message });
  } catch {
    return NextResponse.json(
      { error: "No se pudo desconectar WhatsApp." },
      { status: 500 },
    );
  }
}
