"use server";

import { revalidatePath } from "next/cache";

import { ROUTES } from "@/config/app";
import * as templatesService from "@/services/templates/templates.service";

export type TemplateFormState = {
  error?: string;
  message?: string;
};

export async function createTemplateAction(
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const segmentRaw = String(formData.get("segment_id") ?? "");
  const result = await templatesService.createTemplateForCurrentBusiness({
    name: String(formData.get("name") ?? "").trim().toLowerCase(),
    category: String(formData.get("category") ?? "UTILITY"),
    language: String(formData.get("language") ?? "es"),
    content: String(formData.get("content") ?? ""),
    segment_id: segmentRaw ? segmentRaw : null,
  });

  revalidatePath(ROUTES.plantillas);
  revalidatePath(ROUTES.panel);

  if (!result.ok) {
    return { error: result.error };
  }

  return { message: `Plantilla “${result.template.name}” creada.` };
}

export async function updateTemplateAction(
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const segmentRaw = String(formData.get("segment_id") ?? "");
  const result = await templatesService.updateTemplateForCurrentBusiness({
    id: String(formData.get("id") ?? ""),
    name: String(formData.get("name") ?? "").trim().toLowerCase(),
    category: String(formData.get("category") ?? "UTILITY"),
    language: String(formData.get("language") ?? "es"),
    content: String(formData.get("content") ?? ""),
    segment_id: segmentRaw ? segmentRaw : null,
  });

  revalidatePath(ROUTES.plantillas);
  revalidatePath(ROUTES.panel);

  if (!result.ok) {
    return { error: result.error };
  }

  return { message: `Plantilla “${result.template.name}” actualizada.` };
}

export async function deleteTemplateAction(
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const result = await templatesService.deleteTemplateForCurrentBusiness(
    String(formData.get("id") ?? ""),
  );

  revalidatePath(ROUTES.plantillas);
  revalidatePath(ROUTES.panel);

  if (!result.ok) {
    return { error: result.error };
  }

  return { message: "Plantilla eliminada." };
}

export async function assignTemplateSegmentAction(
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const segmentRaw = String(formData.get("segment_id") ?? "");
  const result =
    await templatesService.assignTemplateSegmentForCurrentBusiness({
      id: String(formData.get("id") ?? ""),
      segment_id: segmentRaw ? segmentRaw : null,
    });

  revalidatePath(ROUTES.plantillas);

  if (!result.ok) {
    return { error: result.error };
  }

  return {
    message: result.template.segment_id
      ? "Segmento asignado."
      : "Segmento quitado.",
  };
}

export async function syncTemplatesAction(
  _prev: TemplateFormState,
  _formData: FormData,
): Promise<TemplateFormState> {
  const result =
    await templatesService.syncTemplatesFromMetaForCurrentBusiness();

  revalidatePath(ROUTES.plantillas);
  revalidatePath(ROUTES.panel);

  if (!result.ok) {
    return { error: result.error };
  }

  return {
    message: `Sync Meta: ${result.total} plantilla(s) (${result.created} nuevas, ${result.updated} actualizadas).`,
  };
}
