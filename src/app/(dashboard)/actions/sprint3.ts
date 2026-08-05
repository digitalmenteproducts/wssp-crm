"use server";

import { revalidatePath } from "next/cache";

import { ROUTES } from "@/config/app";
import { runClassificationBatch } from "@/services/openai/classification-runner.service";
import * as businessService from "@/services/business/business.service";
import * as segmentsService from "@/services/segmentation/segments.service";
import { syncAiSegmentsForBusiness } from "@/services/segmentation/sync-ai-segments.service";
import type { CreateSegmentInput } from "@/schemas/ai";

export type ClassifyFormState = {
  error?: string;
  message?: string;
};

export async function runClassificationAction(
  _prev: ClassifyFormState,
  _formData: FormData,
): Promise<ClassifyFormState> {
  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return { error: workspace.ok ? "Sin empresa." : workspace.error };
  }

  const businessId = workspace.workspace.business.id;

  const result = await runClassificationBatch({
    businessId,
    force: true,
    limit: 20,
  });

  if (result.succeeded > 0) {
    await syncAiSegmentsForBusiness(businessId);
  }

  revalidatePath(ROUTES.contactos);
  revalidatePath(ROUTES.segmentos);
  revalidatePath(ROUTES.panel);

  if (result.failed > 0 && result.succeeded === 0) {
    return {
      error:
        result.errors[0] ??
        "No se pudo clasificar. Revisa la API Key de OpenAI.",
    };
  }

  return {
    message: `Clasificación: ${result.succeeded} ok, ${result.failed} error(es), ${result.processed} procesadas.`,
  };
}

export type SegmentFormState = {
  error?: string;
  message?: string;
};

export async function createSegmentAction(
  _prev: SegmentFormState,
  formData: FormData,
): Promise<SegmentFormState> {
  const name = String(formData.get("name") ?? "");
  const description = String(formData.get("description") ?? "");
  const operatorRaw = String(formData.get("operator") ?? "and");
  const conditionsRaw = String(formData.get("conditions_json") ?? "");

  let conditions: CreateSegmentInput["rules_json"]["conditions"] = [];

  try {
    const parsed = JSON.parse(conditionsRaw) as Array<{
      field: string;
      op: string;
      value: string;
    }>;
    conditions = parsed
      .filter((item) => item.value.trim().length > 0)
      .map((item) => ({
        field: item.field as CreateSegmentInput["rules_json"]["conditions"][number]["field"],
        op: item.op as CreateSegmentInput["rules_json"]["conditions"][number]["op"],
        value:
          item.field === "last_message_within_days"
            ? Number(item.value)
            : item.value,
      }));
  } catch {
    return { error: "Reglas inválidas." };
  }

  const input: CreateSegmentInput = {
    name,
    description: description || undefined,
    rules_json: {
      operator: operatorRaw === "or" ? "or" : "and",
      conditions,
    },
  };

  const result = await segmentsService.createSegmentForCurrentBusiness(input);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(ROUTES.segmentos);
  return { message: `Segmento “${result.segment.name}” creado.` };
}

export async function syncAiSegmentsAction(
  _prev: SegmentFormState,
  _formData: FormData,
): Promise<SegmentFormState> {
  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return { error: workspace.ok ? "Sin empresa." : workspace.error };
  }

  const result = await syncAiSegmentsForBusiness(
    workspace.workspace.business.id,
  );

  revalidatePath(ROUTES.segmentos);

  if (!result.ok) {
    return { error: result.error };
  }

  return {
    message: `Segmentos IA: ${result.created} nuevos, ${result.updated} actualizados, ${result.skipped} omitidos (mín. 5 contactos).`,
  };
}
