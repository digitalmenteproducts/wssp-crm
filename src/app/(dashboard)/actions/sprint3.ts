"use server";

import { revalidatePath } from "next/cache";

import { ROUTES } from "@/config/app";
import { runClassificationBatch } from "@/services/openai/classification-runner.service";
import * as businessService from "@/services/business/business.service";
import * as segmentsService from "@/services/segmentation/segments.service";
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

  const result = await runClassificationBatch({
    businessId: workspace.workspace.business.id,
    force: true,
    limit: 20,
  });

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
  const field = String(formData.get("field") ?? "product");
  const op = String(formData.get("op") ?? "contains");
  const value = String(formData.get("value") ?? "");
  const name = String(formData.get("name") ?? "");
  const description = String(formData.get("description") ?? "");

  const input: CreateSegmentInput = {
    name,
    description: description || undefined,
    rules_json: {
      operator: "and",
      conditions: [
        {
          field: field as CreateSegmentInput["rules_json"]["conditions"][number]["field"],
          op: op as CreateSegmentInput["rules_json"]["conditions"][number]["op"],
          value: field === "last_message_within_days" ? Number(value) : value,
        },
      ],
    },
  };

  const result = await segmentsService.createSegmentForCurrentBusiness(input);
  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(ROUTES.segmentos);
  return { message: `Segmento “${result.segment.name}” creado.` };
}
