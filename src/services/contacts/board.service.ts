import {
  reanalyzeContactSchema,
  updateContactStatusSchema,
  type ReanalyzeContactInput,
  type UpdateContactStatusInput,
} from "@/schemas/contacts";
import * as contactsRepository from "@/repositories/contacts.repository";
import { reanalyzeConversation } from "@/services/openai/classification-runner.service";
import * as businessService from "@/services/business/business.service";
import type { ContactBoardStatus } from "@/types";
import {
  CONTACT_BOARD_LABELS,
  CONTACT_BOARD_STATUSES,
  type ContactBoard,
  type ContactBoardCard,
} from "@/types/contacts";
import { parseContactTags } from "@/services/contacts/detail.service";

function formatZodIssues(error: { issues: { message: string }[] }): string {
  return error.issues.map((issue) => issue.message).join(" ");
}

type ConversationLite = {
  id: string;
  last_message_at: string | null;
  ai_status: string;
};

function asConversation(
  value: ConversationLite | ConversationLite[] | null | undefined,
): ConversationLite | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value;
}

export async function getBoardForCurrentBusiness(): Promise<
  | { ok: true; board: ContactBoard }
  | { ok: false; error: string }
> {
  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return { ok: false, error: workspace.ok ? "Sin empresa." : workspace.error };
  }

  const businessId = workspace.workspace.business.id;
  const { contacts, analyses, messages, messagesCount, analyzedCount } =
    await contactsRepository.listBoardContactRows(businessId);

  if (contacts.error) {
    return { ok: false, error: contacts.error.message };
  }
  if (analyses.error) {
    return { ok: false, error: analyses.error.message };
  }
  if (messages.error) {
    return { ok: false, error: messages.error.message };
  }

  const latestAnalysis = new Map<
    string,
    {
      summary: string | null;
      product: string | null;
      segment: string | null;
      confidence: number | null;
      attributes: Record<string, unknown> | null;
      reason?: string | null;
    }
  >();

  for (const row of analyses.data ?? []) {
    if (!latestAnalysis.has(row.contact_id)) {
      latestAnalysis.set(row.contact_id, row);
    }
  }

  const latestMessageByConversation = new Map<string, string | null>();
  for (const row of messages.data ?? []) {
    if (!latestMessageByConversation.has(row.conversation_id)) {
      latestMessageByConversation.set(row.conversation_id, row.body);
    }
  }

  const cards: ContactBoardCard[] = (contacts.data ?? []).map((contact) => {
    const conversation = asConversation(contact.conversations);
    const analysis = latestAnalysis.get(contact.id);
    const conversationId = conversation?.id ?? null;
    const tags = parseContactTags(analysis?.attributes ?? null, {
      reason: analysis?.reason ?? null,
      segment: analysis?.segment ?? null,
    }).map((tag) => tag.label);

    return {
      id: contact.id,
      phone: contact.phone,
      name: contact.name,
      status: contact.status as ContactBoardStatus,
      conversationId,
      lastMessageAt: conversation?.last_message_at ?? null,
      lastMessageBody: conversationId
        ? (latestMessageByConversation.get(conversationId) ?? null)
        : null,
      product: analysis?.product ?? null,
      summary: analysis?.summary ?? null,
      segment: analysis?.segment ?? null,
      tags: tags.slice(0, 6),
      confidence: analysis?.confidence ?? null,
      aiStatus: conversation?.ai_status ?? null,
    };
  });

  const columns = CONTACT_BOARD_STATUSES.map((status) => ({
    status,
    label: CONTACT_BOARD_LABELS[status],
    cards: cards.filter((card) => card.status === status),
  }));

  return {
    ok: true,
    board: {
      columns,
      totalContacts: cards.length,
      messagesCount,
      analyzedCount,
    },
  };
}

export async function moveContactForCurrentBusiness(
  input: UpdateContactStatusInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = updateContactStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: formatZodIssues(parsed.error) };
  }

  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return { ok: false, error: workspace.ok ? "Sin empresa." : workspace.error };
  }

  const { data, error } = await contactsRepository.updateContactStatusForMember({
    businessId: workspace.workspace.business.id,
    contactId: parsed.data.contactId,
    status: parsed.data.status,
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: "Contacto no encontrado." };
  }

  return { ok: true };
}

export async function reanalyzeContactForCurrentBusiness(
  input: ReanalyzeContactInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = reanalyzeContactSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: formatZodIssues(parsed.error) };
  }

  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return { ok: false, error: workspace.ok ? "Sin empresa." : workspace.error };
  }

  const { data, error } = await contactsRepository.getContactConversationId({
    businessId: workspace.workspace.business.id,
    contactId: parsed.data.contactId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: "Este contacto aún no tiene conversación." };
  }

  return reanalyzeConversation(data.id);
}
