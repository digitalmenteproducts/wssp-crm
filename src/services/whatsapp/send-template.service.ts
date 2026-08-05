export type SendTemplateResult =
  | {
      ok: true;
      waMessageId: string;
      raw: Record<string, unknown>;
    }
  | { ok: false; error: string; raw?: Record<string, unknown> };

export async function sendWhatsAppTemplateMessage(input: {
  accessToken: string;
  phoneNumberId: string;
  to: string;
  templateName: string;
  languageCode: string;
  bodyParameters?: string[];
}): Promise<SendTemplateResult> {
  const to = input.to.replace(/\D/g, "");
  if (!to) {
    return { ok: false, error: "Teléfono inválido." };
  }

  const template: Record<string, unknown> = {
    name: input.templateName,
    language: { code: input.languageCode },
  };

  if (input.bodyParameters && input.bodyParameters.length > 0) {
    template.components = [
      {
        type: "body",
        parameters: input.bodyParameters.map((text) => ({
          type: "text",
          text,
        })),
      },
    ];
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
        type: "template",
        template,
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
        `Meta respondió ${response.status} al enviar la plantilla.`,
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
