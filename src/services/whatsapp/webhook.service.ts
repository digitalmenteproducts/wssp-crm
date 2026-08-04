import { createHmac, timingSafeEqual } from "node:crypto";

import { getOptionalServerEnv } from "@/lib/env";
import * as whatsappRepository from "@/repositories/whatsapp.repository";
import {
  whatsappWebhookPayloadSchema,
  type WhatsAppWebhookMessage,
  type WhatsAppWebhookPayload,
} from "@/schemas/whatsapp";
import type { InboundWhatsAppMessage } from "@/types/whatsapp";

export type WebhookResult =
  | { ok: true; processed: number; skipped: number }
  | { ok: false; error: string; status: number };

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

function extractMessageBody(message: WhatsAppWebhookMessage): string | null {
  if (message.type === "text") {
    return message.text?.body ?? null;
  }

  if (message.type === "button") {
    return message.button?.text ?? message.button?.payload ?? "[button]";
  }

  if (message.type === "interactive") {
    return (
      message.interactive?.button_reply?.title ??
      message.interactive?.list_reply?.title ??
      "[interactive]"
    );
  }

  if (message.type === "image") {
    return message.image?.caption ?? "[image]";
  }

  if (message.type === "document") {
    return (
      message.document?.caption ??
      message.document?.filename ??
      "[document]"
    );
  }

  if (message.type === "audio") {
    return "[audio]";
  }

  return `[${message.type}]`;
}

function toIsoFromWhatsAppTimestamp(timestamp: string): string {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) {
    return new Date().toISOString();
  }

  return new Date(seconds * 1000).toISOString();
}

export async function verifyWebhookSubscription(input: {
  mode: string | null;
  token: string | null;
  challenge: string | null;
}): Promise<{ ok: true; challenge: string } | { ok: false; status: number }> {
  if (input.mode !== "subscribe" || !input.token || !input.challenge) {
    return { ok: false, status: 400 };
  }

  const { data: bySettings } =
    await whatsappRepository.findBusinessIdByVerifyToken(input.token);

  const envToken = getOptionalServerEnv().WHATSAPP_VERIFY_TOKEN;
  const tokenMatchesEnv = Boolean(envToken && envToken === input.token);

  if (!bySettings?.business_id && !tokenMatchesEnv) {
    return { ok: false, status: 403 };
  }

  return { ok: true, challenge: input.challenge };
}

export function validateMetaSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
}): { ok: true } | { ok: false; status: number; error: string } {
  const appSecret = getOptionalServerEnv().META_APP_SECRET;

  // Sin secret configurado permitimos el ingest (piloto).
  if (!appSecret) {
    return { ok: true };
  }

  if (!input.signatureHeader?.startsWith("sha256=")) {
    return {
      ok: false,
      status: 401,
      error: "Firma de Meta ausente o inválida.",
    };
  }

  const receivedHex = input.signatureHeader.slice("sha256=".length);
  const expectedHex = createHmac("sha256", appSecret)
    .update(input.rawBody, "utf8")
    .digest("hex");

  try {
    const received = Buffer.from(receivedHex, "hex");
    const expected = Buffer.from(expectedHex, "hex");

    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      return { ok: false, status: 401, error: "Firma de Meta no coincide." };
    }
  } catch {
    return { ok: false, status: 401, error: "Firma de Meta inválida." };
  }

  return { ok: true };
}

function collectInboundMessages(
  payload: WhatsAppWebhookPayload,
): Array<{
  phoneNumberId: string;
  message: WhatsAppWebhookMessage;
  contactName: string | null;
}> {
  const collected: Array<{
    phoneNumberId: string;
    message: WhatsAppWebhookMessage;
    contactName: string | null;
  }> = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field && change.field !== "messages") {
        continue;
      }

      const phoneNumberId = change.value.metadata.phone_number_id;
      const contacts = change.value.contacts ?? [];
      const nameByWaId = new Map(
        contacts
          .filter((contact) => contact.wa_id)
          .map((contact) => [
            contact.wa_id as string,
            contact.profile?.name ?? null,
          ]),
      );

      for (const message of change.value.messages ?? []) {
        collected.push({
          phoneNumberId,
          message,
          contactName: nameByWaId.get(message.from) ?? null,
        });
      }
    }
  }

  return collected;
}

export async function ingestWhatsAppWebhook(
  payloadUnknown: unknown,
): Promise<WebhookResult> {
  const parsed = whatsappWebhookPayloadSchema.safeParse(payloadUnknown);

  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: "Payload de webhook inválido.",
    };
  }

  const inbound = collectInboundMessages(parsed.data);

  if (inbound.length === 0) {
    return { ok: true, processed: 0, skipped: 0 };
  }

  let processed = 0;
  let skipped = 0;

  for (const item of inbound) {
    const { data: settingsRow, error: settingsError } =
      await whatsappRepository.findBusinessIdByPhoneNumberId(
        item.phoneNumberId,
      );

    if (settingsError) {
      return {
        ok: false,
        status: 500,
        error: `Error buscando empresa: ${settingsError.message}`,
      };
    }

    const businessId = settingsRow?.business_id;

    if (!businessId) {
      skipped += 1;
      continue;
    }

    const event: InboundWhatsAppMessage = {
      businessId,
      phoneNumberId: item.phoneNumberId,
      fromPhone: normalizePhone(item.message.from),
      contactName: item.contactName,
      waMessageId: item.message.id,
      type: item.message.type,
      body: extractMessageBody(item.message),
      timestamp: toIsoFromWhatsAppTimestamp(item.message.timestamp),
      raw: item.message as unknown as Record<string, unknown>,
    };

    try {
      const result = await persistInboundMessage(event);
      if (result === "processed") {
        processed += 1;
      } else {
        skipped += 1;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error persistiendo mensaje.";
      return { ok: false, status: 500, error: message };
    }
  }

  return { ok: true, processed, skipped };
}

async function persistInboundMessage(
  event: InboundWhatsAppMessage,
): Promise<"processed" | "skipped"> {
  const { data: existingMessage } = await whatsappRepository.findMessageByWaId(
    event.businessId,
    event.waMessageId,
  );

  if (existingMessage) {
    return "skipped";
  }

  let contactId: string;
  const { data: existingContact, error: contactLookupError } =
    await whatsappRepository.findContactByPhone(
      event.businessId,
      event.fromPhone,
    );

  if (contactLookupError) {
    throw new Error(contactLookupError.message);
  }

  if (existingContact) {
    contactId = existingContact.id;
    if (event.contactName && event.contactName !== existingContact.name) {
      await whatsappRepository.updateContactName(
        existingContact.id,
        event.contactName,
      );
    }
  } else {
    const { data: createdContact, error: createContactError } =
      await whatsappRepository.createContact({
        businessId: event.businessId,
        phone: event.fromPhone,
        name: event.contactName,
      });

    if (createContactError || !createdContact) {
      throw new Error(
        createContactError?.message ?? "No se pudo crear el contacto.",
      );
    }

    contactId = createdContact.id;
  }

  let conversationId: string;
  const { data: existingConversation, error: conversationLookupError } =
    await whatsappRepository.findConversationByContactId(contactId);

  if (conversationLookupError) {
    throw new Error(conversationLookupError.message);
  }

  if (existingConversation) {
    conversationId = existingConversation.id;
    const resetAiStatus =
      existingConversation.ai_status === "analizado" ||
      existingConversation.ai_status === "error";

    const { error: touchError } = await whatsappRepository.touchConversation({
      conversationId,
      lastMessageAt: event.timestamp,
      resetAiStatus,
    });

    if (touchError) {
      throw new Error(touchError.message);
    }
  } else {
    const { data: createdConversation, error: createConversationError } =
      await whatsappRepository.createConversation({
        businessId: event.businessId,
        contactId,
        lastMessageAt: event.timestamp,
      });

    if (createConversationError || !createdConversation) {
      throw new Error(
        createConversationError?.message ??
          "No se pudo crear la conversación.",
      );
    }

    conversationId = createdConversation.id;
  }

  const { error: messageError } = await whatsappRepository.createMessage({
    businessId: event.businessId,
    conversationId,
    waMessageId: event.waMessageId,
    direction: "inbound",
    type: event.type,
    body: event.body,
    rawPayload: event.raw,
    createdAt: event.timestamp,
  });

  if (messageError) {
    if (messageError.code === "23505") {
      return "skipped";
    }

    throw new Error(messageError.message);
  }

  return "processed";
}
