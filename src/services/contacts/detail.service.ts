import {
  getContactDetailSchema,
  updateContactTagsSchema,
  type UpdateContactTagsInput,
} from "@/schemas/contacts";
import * as contactsRepository from "@/repositories/contacts.repository";
import * as aiRepository from "@/repositories/ai.repository";
import * as businessService from "@/services/business/business.service";
import {
  matchSegmentRules,
  getLastMessageAt,
  type ContactForSegment,
} from "@/services/segmentation/segments.service";
import { syncAiSegmentsForBusiness } from "@/services/segmentation/sync-ai-segments.service";
import type { ContactBoardStatus } from "@/types";
import type {
  ContactDetail,
  ContactDetailSegment,
  ContactTag,
} from "@/types/contacts";

function formatZodIssues(error: { issues: { message: string }[] }): string {
  return error.issues.map((issue) => issue.message).join(" ");
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseContactTags(
  attributes: Record<string, unknown> | null | undefined,
  extras?: { reason?: string | null; segment?: string | null },
): ContactTag[] {
  const attrs = attributes ?? {};
  const hasSplit =
    Array.isArray(attrs.ai_tags) || Array.isArray(attrs.manual_tags);

  const aiTags = hasSplit
    ? asStringArray(attrs.ai_tags)
    : asStringArray(attrs.tags);
  const manualTags = hasSplit ? asStringArray(attrs.manual_tags) : [];

  const map = new Map<string, ContactTag>();

  for (const label of aiTags) {
    map.set(label.toLowerCase(), { label, source: "ai" });
  }
  for (const label of manualTags) {
    map.set(label.toLowerCase(), { label, source: "manual" });
  }

  // Sugerencias visibles desde campos IA si aún no están como chip.
  for (const candidate of [extras?.reason, extras?.segment]) {
    if (!candidate?.trim()) continue;
    const key = candidate.trim().toLowerCase();
    if (!map.has(key)) {
      map.set(key, { label: candidate.trim(), source: "ai" });
    }
  }

  return Array.from(map.values());
}

function buildAttributesFromTags(
  existing: Record<string, unknown> | null | undefined,
  tags: ContactTag[],
): Record<string, unknown> {
  const ai_tags = tags
    .filter((tag) => tag.source === "ai")
    .map((tag) => tag.label);
  const manual_tags = tags
    .filter((tag) => tag.source === "manual")
    .map((tag) => tag.label);
  const merged = Array.from(
    new Set([...ai_tags, ...manual_tags].map((item) => item.trim()).filter(Boolean)),
  );

  return {
    ...(existing ?? {}),
    ai_tags,
    manual_tags,
    tags: merged,
  };
}

export async function getContactDetailForCurrentBusiness(
  contactId: string,
): Promise<{ ok: true; detail: ContactDetail } | { ok: false; error: string }> {
  const parsed = getContactDetailSchema.safeParse({ contactId });
  if (!parsed.success) {
    return { ok: false, error: formatZodIssues(parsed.error) };
  }

  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return { ok: false, error: workspace.ok ? "Sin empresa." : workspace.error };
  }

  const businessId = workspace.workspace.business.id;
  const { contact, analysis, messages } =
    await contactsRepository.getContactDetailRows({
      businessId,
      contactId: parsed.data.contactId,
    });

  if (contact.error) {
    return { ok: false, error: contact.error.message };
  }
  if (!contact.data) {
    return { ok: false, error: "Contacto no encontrado." };
  }

  if (analysis?.error) {
    return { ok: false, error: analysis.error.message };
  }
  if (messages?.error) {
    return { ok: false, error: messages.error.message };
  }

  const conversation = Array.isArray(contact.data.conversations)
    ? contact.data.conversations[0]
    : contact.data.conversations;

  const analysisRow = analysis?.data ?? null;
  const tags = parseContactTags(analysisRow?.attributes, {
    reason: analysisRow?.reason ?? null,
    segment: analysisRow?.segment ?? null,
  });

  const { data: segments, error: segmentsError } =
    await aiRepository.listSegmentsByBusiness(businessId);
  if (segmentsError) {
    return { ok: false, error: segmentsError.message };
  }

  const contactForSegment: ContactForSegment = {
    id: contact.data.id,
    phone: contact.data.phone,
    name: contact.data.name,
    status: contact.data.status,
    conversations: contact.data.conversations,
  };

  const matchingSegments: ContactDetailSegment[] = [];
  for (const segment of segments ?? []) {
    const matched = matchSegmentRules(segment.rules_json, {
      product: analysisRow?.product ?? null,
      subcategory: analysisRow?.subcategory ?? null,
      intent: analysisRow?.intent ?? null,
      contactStatus: contact.data.status,
      reason: analysisRow?.reason ?? null,
      segment: analysisRow?.segment ?? null,
      tags: tags.map((tag) => tag.label),
      lastMessageAt: getLastMessageAt(contactForSegment),
    });
    if (matched) {
      matchingSegments.push({
        id: segment.id,
        name: segment.name,
        origin: segment.origin ?? "manual",
      });
    }
  }

  const similarSegmentId =
    matchingSegments.find((item) => item.origin === "ai")?.id ??
    matchingSegments.find((item) => item.origin === "system")?.id ??
    matchingSegments[0]?.id ??
    null;

  return {
    ok: true,
    detail: {
      id: contact.data.id,
      phone: contact.data.phone,
      name: contact.data.name,
      status: contact.data.status as ContactBoardStatus,
      conversationId: conversation?.id ?? null,
      lastMessageAt: conversation?.last_message_at ?? null,
      analysis: analysisRow
        ? {
            id: analysisRow.id,
            summary: analysisRow.summary,
            product: analysisRow.product,
            subcategory: analysisRow.subcategory,
            intent: analysisRow.intent,
            reason: analysisRow.reason,
            segment: analysisRow.segment,
            confidence: analysisRow.confidence,
            created_at: analysisRow.created_at,
          }
        : null,
      tags,
      messages: (messages?.data ?? []).map((message) => ({
        id: String(message.id),
        direction: String(message.direction),
        type: String(message.type),
        body: message.body,
        created_at: String(message.created_at),
      })),
      segments: matchingSegments,
      similarSegmentId,
    },
  };
}

export async function updateContactTagsForCurrentBusiness(
  input: UpdateContactTagsInput,
): Promise<{ ok: true; tags: ContactTag[] } | { ok: false; error: string }> {
  const parsed = updateContactTagsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: formatZodIssues(parsed.error) };
  }

  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return { ok: false, error: workspace.ok ? "Sin empresa." : workspace.error };
  }

  const businessId = workspace.workspace.business.id;
  const { contact, analysis } = await contactsRepository.getContactDetailRows({
    businessId,
    contactId: parsed.data.contactId,
  });

  if (contact.error) {
    return { ok: false, error: contact.error.message };
  }
  if (!contact.data) {
    return { ok: false, error: "Contacto no encontrado." };
  }
  if (analysis?.error) {
    return { ok: false, error: analysis.error.message };
  }
  if (!analysis?.data) {
    return {
      ok: false,
      error: "Clasifica el contacto con IA antes de editar etiquetas.",
    };
  }

  const attributes = buildAttributesFromTags(
    analysis.data.attributes,
    parsed.data.tags,
  );

  const { error } = await contactsRepository.updateLatestAnalysisAttributes({
    businessId,
    analysisId: analysis.data.id,
    attributes,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  await syncAiSegmentsForBusiness(businessId);

  return {
    ok: true,
    tags: parseContactTags(attributes),
  };
}
