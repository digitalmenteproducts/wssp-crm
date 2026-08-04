import { NextResponse, type NextRequest } from "next/server";

import * as webhookService from "@/services/whatsapp/webhook.service";

export const runtime = "nodejs";

/**
 * Verificación del webhook de Meta WhatsApp Cloud API.
 * GET /api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const result = await webhookService.verifyWebhookSubscription({
    mode: params.get("hub.mode"),
    token: params.get("hub.verify_token"),
    challenge: params.get("hub.challenge"),
  });

  if (!result.ok) {
    return new NextResponse("Forbidden", { status: result.status });
  }

  return new NextResponse(result.challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

/**
 * Recepción de eventos de WhatsApp.
 * Persiste contactos, conversaciones y mensajes.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  const signatureCheck = webhookService.validateMetaSignature({
    rawBody,
    signatureHeader: signature,
  });

  if (!signatureCheck.ok) {
    return NextResponse.json(
      { error: signatureCheck.error },
      { status: signatureCheck.status },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const result = await webhookService.ingestWhatsAppWebhook(payload);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    processed: result.processed,
    skipped: result.skipped,
  });
}
