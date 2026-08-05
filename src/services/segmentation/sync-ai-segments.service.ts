import type { Segment, SegmentRules } from "@/types/ai";
import * as aiRepository from "@/repositories/ai.repository";
import * as businessService from "@/services/business/business.service";
import {
  buildSourceKey,
  humanizeSegmentDescription,
  humanizeSegmentName,
  rulesAreEquivalent,
} from "@/lib/segments/rules";
import {
  countMatchesForRules,
  type AnalysisLite,
  type ContactForSegment,
} from "@/services/segmentation/segments.service";

const AI_MIN_CONTACTS = 5;

type ProposedSegment = {
  sourceKey: string;
  name: string;
  description: string;
  rules: SegmentRules;
};

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function extractTags(attributes: Record<string, unknown> | null | undefined) {
  if (!attributes) return [] as string[];
  const tags = attributes.tags;
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((tag): tag is string => typeof tag === "string")
    .map(normalizeToken)
    .filter(Boolean);
}

function proposeAiSegments(
  contacts: ContactForSegment[],
  latestByContact: Map<string, AnalysisLite>,
): ProposedSegment[] {
  const productCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  const intentCounts = new Map<string, number>();
  const reasonCounts = new Map<string, number>();
  const comboCounts = new Map<
    string,
    { product: string; status: string; count: number }
  >();

  for (const contact of contacts) {
    const analysis = latestByContact.get(contact.id);
    if (!analysis) continue;

    if (analysis.product?.trim()) {
      const key = normalizeToken(analysis.product);
      productCounts.set(key, (productCounts.get(key) ?? 0) + 1);
    }

    for (const tag of extractTags(analysis.attributes)) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }

    if (analysis.intent?.trim()) {
      const key = normalizeToken(analysis.intent);
      intentCounts.set(key, (intentCounts.get(key) ?? 0) + 1);
    }

    if (analysis.reason?.trim()) {
      const key = normalizeToken(analysis.reason);
      reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1);
    }

    if (
      analysis.product?.trim() &&
      (contact.status === "no_compro" || contact.status === "interesado")
    ) {
      const product = normalizeToken(analysis.product);
      const comboKey = `${product}|${contact.status}`;
      const existing = comboCounts.get(comboKey);
      if (existing) {
        existing.count += 1;
      } else {
        comboCounts.set(comboKey, {
          product,
          status: contact.status,
          count: 1,
        });
      }
    }
  }

  const proposals: ProposedSegment[] = [];

  for (const [product, count] of productCounts) {
    if (count < AI_MIN_CONTACTS) continue;
    proposals.push({
      sourceKey: buildSourceKey(["ai", "product", product]),
      name: humanizeSegmentName({ product }),
      description: humanizeSegmentDescription({ product }),
      rules: {
        operator: "and",
        conditions: [{ field: "product", op: "contains", value: product }],
      },
    });
  }

  for (const [tag, count] of tagCounts) {
    if (count < AI_MIN_CONTACTS) continue;
    proposals.push({
      sourceKey: buildSourceKey(["ai", "tag", tag]),
      name: humanizeSegmentName({ tag }),
      description: humanizeSegmentDescription({ tag }),
      rules: {
        operator: "and",
        conditions: [{ field: "tag", op: "contains", value: tag }],
      },
    });
  }

  for (const [intent, count] of intentCounts) {
    if (count < AI_MIN_CONTACTS) continue;
    proposals.push({
      sourceKey: buildSourceKey(["ai", "intent", intent]),
      name: humanizeSegmentName({ intent }),
      description: humanizeSegmentDescription({ intent }),
      rules: {
        operator: "and",
        conditions: [{ field: "intent", op: "eq", value: intent }],
      },
    });
  }

  for (const [reason, count] of reasonCounts) {
    if (count < AI_MIN_CONTACTS) continue;
    proposals.push({
      sourceKey: buildSourceKey(["ai", "reason", reason]),
      name: humanizeSegmentName({ reason }),
      description: humanizeSegmentDescription({ reason }),
      rules: {
        operator: "and",
        conditions: [{ field: "reason", op: "contains", value: reason }],
      },
    });
  }

  for (const combo of comboCounts.values()) {
    if (combo.count < AI_MIN_CONTACTS) continue;
    proposals.push({
      sourceKey: buildSourceKey([
        "ai",
        "combo",
        combo.product,
        combo.status,
        "30d",
      ]),
      name: humanizeSegmentName({
        product: combo.product,
        status: combo.status,
        days: 30,
      }),
      description: humanizeSegmentDescription({
        product: combo.product,
        status: combo.status,
        days: 30,
      }),
      rules: {
        operator: "and",
        conditions: [
          { field: "product", op: "contains", value: combo.product },
          { field: "contact_status", op: "eq", value: combo.status },
          { field: "last_message_within_days", op: "lte", value: 30 },
        ],
      },
    });
  }

  return proposals;
}

function findEquivalent(
  existing: Segment[],
  rules: SegmentRules,
): Segment | undefined {
  return existing.find(
    (segment) =>
      segment.origin !== "manual" &&
      rulesAreEquivalent(segment.rules_json, rules),
  );
}

export async function syncAiSegmentsForBusiness(
  businessId: string,
): Promise<
  | { ok: true; created: number; updated: number; skipped: number }
  | { ok: false; error: string }
> {
  const { data: existing, error: segmentsError } =
    await aiRepository.listSegmentsByBusiness(businessId);

  if (segmentsError) {
    return { ok: false, error: segmentsError.message };
  }

  const { contacts, analyses } =
    await aiRepository.listContactsWithLatestAnalysis(businessId);

  if (contacts.error) {
    return { ok: false, error: contacts.error.message };
  }
  if (analyses.error) {
    return { ok: false, error: analyses.error.message };
  }

  const contactRows = (contacts.data ?? []) as ContactForSegment[];
  const latestByContact = new Map<string, AnalysisLite>();
  for (const row of (analyses.data ?? []) as AnalysisLite[]) {
    if (!latestByContact.has(row.contact_id)) {
      latestByContact.set(row.contact_id, row);
    }
  }

  const proposals = proposeAiSegments(contactRows, latestByContact);
  const current = [...(existing ?? [])];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const proposal of proposals) {
    const matchCount = countMatchesForRules(
      proposal.rules,
      contactRows,
      latestByContact,
    );

    if (matchCount < AI_MIN_CONTACTS) {
      skipped += 1;
      continue;
    }

    const byKey = current.find(
      (segment) => segment.source_key === proposal.sourceKey,
    );
    const byRules = byKey ?? findEquivalent(current, proposal.rules);

    if (byRules) {
      // Nunca modificar reglas de segmentos manuales.
      if (byRules.origin === "manual") {
        skipped += 1;
        continue;
      }

      const needsName = byRules.name !== proposal.name;
      const needsDescription = byRules.description !== proposal.description;

      if (needsName || needsDescription) {
        const { error } = await aiRepository.updateSegment({
          businessId,
          id: byRules.id,
          patch: {
            ...(needsName ? { name: proposal.name } : {}),
            ...(needsDescription ? { description: proposal.description } : {}),
          },
        });
        if (error) {
          return { ok: false, error: error.message };
        }
        updated += 1;
      } else {
        skipped += 1;
      }
      continue;
    }

    const { data, error } = await aiRepository.createSegment({
      businessId,
      name: proposal.name,
      description: proposal.description,
      rulesJson: proposal.rules,
      origin: "ai",
      sourceKey: proposal.sourceKey,
    });

    if (error || !data) {
      // Conflicto de nombre: reutilizar si hay equivalente
      if (error?.message?.toLowerCase().includes("duplicate")) {
        skipped += 1;
        continue;
      }
      return {
        ok: false,
        error: error?.message ?? "No se pudo crear segmento IA.",
      };
    }

    current.push({
      ...data,
      origin: "ai",
      source_key: proposal.sourceKey,
      rules_json: proposal.rules,
    });
    created += 1;
  }

  return { ok: true, created, updated, skipped };
}

export async function syncAiSegmentsForCurrentBusiness(): Promise<
  | { ok: true; created: number; updated: number; skipped: number }
  | { ok: false; error: string }
> {
  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return { ok: false, error: workspace.ok ? "Sin empresa." : workspace.error };
  }

  return syncAiSegmentsForBusiness(workspace.workspace.business.id);
}
