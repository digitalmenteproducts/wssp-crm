import type {
  ContactSegmentMatch,
  Segment,
  SegmentRuleCondition,
  SegmentRules,
} from "@/types/ai";
import type { ContactBoardStatus } from "@/types";
import * as aiRepository from "@/repositories/ai.repository";
import { createSegmentSchema, type CreateSegmentInput } from "@/schemas/ai";
import * as businessService from "@/services/business/business.service";

type AnalysisLite = {
  contact_id: string;
  summary: string | null;
  product: string | null;
  subcategory: string | null;
  intent: string | null;
  status: string | null;
  reason: string | null;
  segment: string | null;
  created_at: string;
};

function evaluateCondition(
  condition: SegmentRuleCondition,
  ctx: {
    product: string | null;
    subcategory: string | null;
    intent: string | null;
    contactStatus: string;
    reason: string | null;
    segment: string | null;
    lastMessageAt: string | null;
  },
): boolean {
  const raw =
    condition.field === "product"
      ? ctx.product
      : condition.field === "subcategory"
        ? ctx.subcategory
        : condition.field === "intent"
          ? ctx.intent
          : condition.field === "contact_status"
            ? ctx.contactStatus
            : condition.field === "reason"
              ? ctx.reason
              : condition.field === "segment"
                ? ctx.segment
                : null;

  if (condition.field === "last_message_within_days") {
    if (!ctx.lastMessageAt) {
      return false;
    }
    const days =
      (Date.now() - new Date(ctx.lastMessageAt).getTime()) /
      (1000 * 60 * 60 * 24);
    const value = Number(condition.value);
    if (condition.op === "lte") return days <= value;
    if (condition.op === "gte") return days >= value;
    return false;
  }

  const left = String(raw ?? "").toLowerCase();
  const right = String(condition.value).toLowerCase();

  if (condition.op === "eq") {
    return left === right;
  }

  if (condition.op === "contains") {
    return left.includes(right);
  }

  return false;
}

export function matchSegmentRules(
  rules: SegmentRules,
  ctx: {
    product: string | null;
    subcategory: string | null;
    intent: string | null;
    contactStatus: string;
    reason: string | null;
    segment: string | null;
    lastMessageAt: string | null;
  },
): boolean {
  if (!rules.conditions.length) {
    return false;
  }

  const results = rules.conditions.map((condition) =>
    evaluateCondition(condition, ctx),
  );

  return rules.operator === "or"
    ? results.some(Boolean)
    : results.every(Boolean);
}

export async function listSegmentsForCurrentBusiness(): Promise<
  | { ok: true; segments: Segment[] }
  | { ok: false; error: string }
> {
  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return { ok: false, error: workspace.ok ? "Sin workspace" : workspace.error };
  }

  const { data, error } = await aiRepository.listSegmentsByBusiness(
    workspace.workspace.business.id,
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, segments: data ?? [] };
}

export async function createSegmentForCurrentBusiness(
  input: CreateSegmentInput,
): Promise<{ ok: true; segment: Segment } | { ok: false; error: string }> {
  const parsed = createSegmentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join(" "),
    };
  }

  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return { ok: false, error: workspace.ok ? "Sin workspace" : workspace.error };
  }

  const { data, error } = await aiRepository.createSegment({
    businessId: workspace.workspace.business.id,
    name: parsed.data.name,
    description: parsed.data.description,
    rulesJson: parsed.data.rules_json,
  });

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo crear el segmento." };
  }

  return { ok: true, segment: data };
}

export async function evaluateSegmentMembership(
  segmentId: string,
): Promise<
  | { ok: true; segment: Segment; matches: ContactSegmentMatch[] }
  | { ok: false; error: string }
> {
  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return { ok: false, error: workspace.ok ? "Sin workspace" : workspace.error };
  }

  const businessId = workspace.workspace.business.id;
  const { data: segments, error: segmentsError } =
    await aiRepository.listSegmentsByBusiness(businessId);

  if (segmentsError) {
    return { ok: false, error: segmentsError.message };
  }

  const segment = (segments ?? []).find((item) => item.id === segmentId);
  if (!segment) {
    return { ok: false, error: "Segmento no encontrado." };
  }

  const { contacts, analyses } =
    await aiRepository.listContactsWithLatestAnalysis(businessId);

  if (contacts.error) {
    return { ok: false, error: contacts.error.message };
  }

  if (analyses.error) {
    return { ok: false, error: analyses.error.message };
  }

  const latestByContact = new Map<string, AnalysisLite>();
  for (const row of (analyses.data ?? []) as AnalysisLite[]) {
    if (!latestByContact.has(row.contact_id)) {
      latestByContact.set(row.contact_id, row);
    }
  }

  const matches: ContactSegmentMatch[] = [];

  for (const contact of contacts.data ?? []) {
    const analysis = latestByContact.get(contact.id);
    const conversations = Array.isArray(contact.conversations)
      ? contact.conversations
      : contact.conversations
        ? [contact.conversations]
        : [];
    const lastMessageAt =
      conversations
        .map((item: { last_message_at?: string | null }) => item.last_message_at)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null;

    const matched = matchSegmentRules(segment.rules_json, {
      product: analysis?.product ?? null,
      subcategory: analysis?.subcategory ?? null,
      intent: analysis?.intent ?? null,
      contactStatus: contact.status,
      reason: analysis?.reason ?? null,
      segment: analysis?.segment ?? null,
      lastMessageAt,
    });

    if (matched) {
      matches.push({
        contactId: contact.id,
        phone: contact.phone,
        name: contact.name,
        status: contact.status as ContactBoardStatus,
        product: analysis?.product ?? null,
        summary: analysis?.summary ?? null,
        lastMessageAt,
      });
    }
  }

  return { ok: true, segment, matches };
}
