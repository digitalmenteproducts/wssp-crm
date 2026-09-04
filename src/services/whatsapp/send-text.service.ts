export type SendTextResult =
  | {
      ok: true;
      waMessageId: string;
      raw: Record<string, unknown>;
    }
  | { ok: false; error: string; raw?: Record<string, unknown> };

export async function sendWhatsAppTextMessage(input: {
  accessToken: string;
  phoneNumberId: string;
  to: string;
  body: string;
}): Promise<SendTextResult> {
  const to = input.to.replace(/\D/g, "");
  const text = input.body.trim();
  if (!to) {
    return { ok: false, error: "Teléfono inválido." };
  }
  if (!text) {
    return { ok: false, error: "Mensaje vacío." };
  }

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(input.phoneNumberId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { preview_url: false, body: text },
      }),
      cache: "no-store",
    },
  );

  const payload = (await response.json()) as {
    messages?: Array<{ id?: string }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    return {
      ok: false,
      error:
        payload.error?.message ??
        `Meta respondió ${response.status} al enviar el mensaje.`,
      raw: payload as Record<string, unknown>,
    };
  }

  const waMessageId = payload.messages?.[0]?.id;
  if (!waMessageId) {
    return {
      ok: false,
      error: "Meta no devolvió ID de mensaje.",
      raw: payload as Record<string, unknown>,
    };
  }

  return {
    ok: true,
    waMessageId,
    raw: payload as Record<string, unknown>,
  };
}
