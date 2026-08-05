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
import { summarizeRules } from "@/lib/segments/rules";

export type AnalysisLite = {
  contact_id: string;
  summary: string | null;
  product: string | null;
  subcategory: string | null;
  intent: string | null;
  status: string | null;
  reason: string | null;
  segment: string | null;
  attributes?: Record<string, unknown> | null;
  created_at: string;
};

export type ContactForSegment = {
  id: string;
  phone: string;
  name: string | null;
  status: string;
  conversations?:
    | { last_message_at?: string | null }
    | { last_message_at?: string | null }[]
    | null;
};

function extractTags(attributes: Record<string, unknown> | null | undefined) {
  if (!attributes) return [] as string[];
  const tags = attributes.tags;
  if (!Array.isArray(tags)) return [];
  return tags.filter((tag): tag is string => typeof tag === "string");
}

function evaluateCondition(
  condition: SegmentRuleCondition,
  ctx: {
    product: string | null;
    subcategory: string | null;
    intent: string | null;
    contactStatus: string;
    reason: string | null;
    segment: string | null;
    tags: string[];
    lastMessageAt: string | null;
  },
): boolean {
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

  if (condition.field === "tag") {
    const needle = String(condition.value).toLowerCase();
    if (condition.op === "eq") {
      return ctx.tags.some((tag) => tag.toLowerCase() === needle);
    }
    if (condition.op === "contains") {
      return ctx.tags.some((tag) => tag.toLowerCase().includes(needle));
    }
    return false;
  }

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
    tags?: string[];
    lastMessageAt: string | null;
  },
): boolean {
  if (!rules.conditions.length) {
    return false;
  }

  const fullCtx = {
    ...ctx,
    tags: ctx.tags ?? [],
  };

  const results = rules.conditions.map((condition) =>
    evaluateCondition(condition, fullCtx),
  );

  return rules.operator === "or"
    ? results.some(Boolean)
    : results.every(Boolean);
}

export function getLastMessageAt(
  contact: ContactForSegment,
): string | null {
  const conversations = Array.isArray(contact.conversations)
    ? contact.conversations
    : contact.conversations
      ? [contact.conversations]
      : [];

  return (
    conversations
      .map((item) => item.last_message_at)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null
  );
}

export function countMatchesForRules(
  rules: SegmentRules,
  contacts: ContactForSegment[],
  latestByContact: Map<string, AnalysisLite>,
): number {
  let count = 0;
  for (const contact of contacts) {
    const analysis = latestByContact.get(contact.id);
    const matched = matchSegmentRules(rules, {
      product: analysis?.product ?? null,
      subcategory: analysis?.subcategory ?? null,
      intent: analysis?.intent ?? null,
      contactStatus: contact.status,
      reason: analysis?.reason ?? null,
      segment: analysis?.segment ?? null,
      tags: extractTags(analysis?.attributes),
      lastMessageAt: getLastMessageAt(contact),
    });
    if (matched) count += 1;
  }
  return count;
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

export type SegmentCardData = {
  segment: Segment;
  count: number;
  rulesSummary: string;
  error: string | null;
};

export async function listSegmentCardsForCurrentBusiness(): Promise<
  | { ok: true; cards: SegmentCardData[] }
  | { ok: false; error: string }
> {
  const list = await listSegmentsForCurrentBusiness();
  if (!list.ok) return list;

  const cards: SegmentCardData[] = [];
  for (const segment of list.segments) {
    const evaluation = await evaluateSegmentMembership(segment.id);
    cards.push({
      segment,
      count: evaluation.ok ? evaluation.matches.length : 0,
      rulesSummary: summarizeRules(segment.rules_json),
      error: evaluation.ok ? null : evaluation.error,
    });
  }

  return { ok: true, cards };
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
    origin: "manual",
    sourceKey: null,
  });

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo crear el segmento." };
  }

  return {
    ok: true,
    segment: {
      ...data,
      origin: data.origin ?? "manual",
      source_key: data.source_key ?? null,
      rules_json: data.rules_json,
    },
  };
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

  for (const contact of (contacts.data ?? []) as ContactForSegment[]) {
    const analysis = latestByContact.get(contact.id);
    const lastMessageAt = getLastMessageAt(contact);

    const matched = matchSegmentRules(segment.rules_json, {
      product: analysis?.product ?? null,
      subcategory: analysis?.subcategory ?? null,
      intent: analysis?.intent ?? null,
      contactStatus: contact.status,
      reason: analysis?.reason ?? null,
      segment: analysis?.segment ?? null,
      tags: extractTags(analysis?.attributes),
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
