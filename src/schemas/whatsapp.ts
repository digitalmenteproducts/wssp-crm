import { z } from "zod";

const whatsappTextSchema = z.object({
  body: z.string().optional(),
});

const whatsappMessageSchema = z.object({
  from: z.string().min(1),
  id: z.string().min(1),
  timestamp: z.string().min(1),
  type: z.string().min(1),
  text: whatsappTextSchema.optional(),
  button: z
    .object({
      text: z.string().optional(),
      payload: z.string().optional(),
    })
    .optional(),
  interactive: z
    .object({
      type: z.string().optional(),
      button_reply: z
        .object({
          id: z.string().optional(),
          title: z.string().optional(),
        })
        .optional(),
      list_reply: z
        .object({
          id: z.string().optional(),
          title: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  image: z
    .object({
      caption: z.string().optional(),
      id: z.string().optional(),
    })
    .optional(),
  audio: z
    .object({
      id: z.string().optional(),
    })
    .optional(),
  document: z
    .object({
      caption: z.string().optional(),
      filename: z.string().optional(),
      id: z.string().optional(),
    })
    .optional(),
});

const whatsappContactSchema = z.object({
  wa_id: z.string().optional(),
  profile: z
    .object({
      name: z.string().optional(),
    })
    .optional(),
});

const whatsappChangeValueSchema = z.object({
  messaging_product: z.string().optional(),
  metadata: z.object({
    display_phone_number: z.string().optional(),
    phone_number_id: z.string().min(1),
  }),
  contacts: z.array(whatsappContactSchema).optional(),
  messages: z.array(whatsappMessageSchema).optional(),
  statuses: z.array(z.unknown()).optional(),
});

export const whatsappWebhookPayloadSchema = z.object({
  object: z.string().optional(),
  entry: z
    .array(
      z.object({
        id: z.string().optional(),
        changes: z
          .array(
            z.object({
              field: z.string().optional(),
              value: whatsappChangeValueSchema,
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});

export type WhatsAppWebhookPayload = z.infer<typeof whatsappWebhookPayloadSchema>;
export type WhatsAppWebhookMessage = z.infer<typeof whatsappMessageSchema>;
