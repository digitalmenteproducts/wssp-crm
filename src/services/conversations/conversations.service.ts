import {
  CONVERSATION_MESSAGES_LIMIT,
  CONVERSATIONS_LIST_LIMIT,
  isAiMessage,
  isSimulationMessage,
} from "@/lib/conversations";
import * as conversationsRepository from "@/repositories/conversations.repository";
import { conversationIdSchema } from "@/schemas/conversations";
import * as businessService from "@/services/business/business.service";
import type {
  ConversationListItem,
  SelectedConversation,
} from "@/types/conversations";

export type ConversationsPageResult =
  | {
      ok: true;
      timezone: string;
      conversations: ConversationListItem[];
      selected: SelectedConversation | null;
      selectedNotFound: boolean;
    }
  | { ok: false; error: string };

function firstContact<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

/**
 * Visor de solo lectura de conversaciones del negocio activo.
 * El negocio sale siempre de resolveCurrentWorkspace(); del navegador solo llega
 * el id de conversación, que se valida contra ese negocio.
 */
export async function getConversationsPageData(
  requestedConversationId: string | null,
): Promise<ConversationsPageResult> {
  const workspace = await businessService.resolveCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return { ok: false, error: workspace.ok ? "Sin empresa." : workspace.error };
  }

  const { business } = workspace.workspace;

  const { data: rows, error } =
    await conversationsRepository.listRecentConversations(
      business.id,
      CONVERSATIONS_LIST_LIMIT,
    );
  if (error) {
    return { ok: false, error: "No se pudieron cargar las conversaciones." };
  }

  const conversations: ConversationListItem[] = (rows ?? []).map((row) => {
    const contact = firstContact(row.contact);
    const last = row.last_message?.[0] ?? null;
    return {
      id: row.id,
      contact_name: contact?.name ?? null,
      contact_phone: contact?.phone ?? null,
      last_message_at: last?.created_at ?? row.last_message_at,
      last_message_body: last?.body ?? null,
      last_message_type: last?.type ?? null,
      last_message_direction: last?.direction ?? null,
    };
  });

  let selected: SelectedConversation | null = null;
  let selectedNotFound = false;

  if (requestedConversationId) {
    const parsed = conversationIdSchema.safeParse(requestedConversationId);
    const header = parsed.success
      ? await conversationsRepository.findConversationForBusiness({
          businessId: business.id,
          conversationId: parsed.data,
        })
      : null;

    if (!header || header.error || !header.data) {
      selectedNotFound = true;
    } else {
      const { data: messages, error: messagesError } =
        await conversationsRepository.listRecentConversationMessages({
          businessId: business.id,
          conversationId: header.data.id,
          limit: CONVERSATION_MESSAGES_LIMIT,
        });
      if (messagesError) {
        return { ok: false, error: "No se pudieron cargar los mensajes." };
      }

      const contact = firstContact(header.data.contact);
      selected = {
        id: header.data.id,
        contact_name: contact?.name ?? null,
        contact_phone: contact?.phone ?? null,
        messages: [...(messages ?? [])].reverse().map((m) => ({
          id: m.id,
          direction: m.direction,
          type: m.type,
          body: m.body,
          created_at: m.created_at,
          is_ai: isAiMessage(m.direction, m.type),
          is_simulation: isSimulationMessage(m.harness),
        })),
      };
    }
  }

  return {
    ok: true,
    timezone: business.timezone,
    conversations,
    selected,
    selectedNotFound,
  };
}
