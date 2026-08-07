"use server";

import { revalidatePath } from "next/cache";

import { ROUTES } from "@/config/app";
import * as templatesService from "@/services/templates/templates.service";
import { slugifyTemplateName } from "@/lib/templates/slug";
import type { TemplateButton } from "@/types/templates";

export type TemplateFormState = {
  error?: string;
  message?: string;
};

function parseButtons(raw: string): TemplateButton[] {
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as TemplateButton[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseExamples(raw: string): Record<string, string> {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function createTemplateAction(
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const displayName = String(formData.get("display_name") ?? "").trim();
  const technical =
    String(formData.get("name") ?? "").trim().toLowerCase() ||
    slugifyTemplateName(displayName);
  const segmentRaw = String(formData.get("segment_id") ?? "");

  const result = await templatesService.createTemplateForCurrentBusiness({
    display_name: displayName,
    name: technical,
    category: String(formData.get("category") ?? "UTILITY") as
      | "MARKETING"
      | "UTILITY",
    language: String(formData.get("language") ?? "es") as "es" | "en_US",
    header_text: String(formData.get("header_text") ?? "").trim() || null,
    content: String(formData.get("content") ?? ""),
    footer_text: String(formData.get("footer_text") ?? "").trim() || null,
    buttons: parseButtons(String(formData.get("buttons_json") ?? "")),
    variable_examples: parseExamples(
      String(formData.get("variable_examples_json") ?? ""),
    ),
    segment_id: segmentRaw ? segmentRaw : null,
  });

  revalidatePath(ROUTES.plantillas);
  revalidatePath(ROUTES.panel);

  if (!result.ok) {
    return { error: result.error };
  }

  return {
    message: `Borrador “${result.template.display_name}” guardado.`,
  };
}

export async function updateTemplateAction(
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const displayName = String(formData.get("display_name") ?? "").trim();
  const technical =
    String(formData.get("name") ?? "").trim().toLowerCase() ||
    slugifyTemplateName(displayName);
  const segmentRaw = String(formData.get("segment_id") ?? "");

  const result = await templatesService.updateTemplateForCurrentBusiness({
    id: String(formData.get("id") ?? ""),
    display_name: displayName,
    name: technical,
    category: String(formData.get("category") ?? "UTILITY") as
      | "MARKETING"
      | "UTILITY",
    language: String(formData.get("language") ?? "es") as "es" | "en_US",
    header_text: String(formData.get("header_text") ?? "").trim() || null,
    content: String(formData.get("content") ?? ""),
    footer_text: String(formData.get("footer_text") ?? "").trim() || null,
    buttons: parseButtons(String(formData.get("buttons_json") ?? "")),
    variable_examples: parseExamples(
      String(formData.get("variable_examples_json") ?? ""),
    ),
    segment_id: segmentRaw ? segmentRaw : null,
  });

  revalidatePath(ROUTES.plantillas);
  revalidatePath(ROUTES.panel);

  if (!result.ok) {
    return { error: result.error };
  }

  return {
    message: `Plantilla “${result.template.display_name}” actualizada.`,
  };
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

export async function submitTemplateAction(
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const result = await templatesService.submitTemplateForReview(
    String(formData.get("id") ?? ""),
  );

  revalidatePath(ROUTES.plantillas);
  revalidatePath(ROUTES.campanasNueva);

  if (!result.ok) {
    return { error: result.error };
  }

  return { message: "Plantilla enviada para revisión." };
}

export async function duplicateTemplateAction(
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const result = await templatesService.duplicateTemplateForCurrentBusiness(
    String(formData.get("id") ?? ""),
  );

  revalidatePath(ROUTES.plantillas);

  if (!result.ok) {
    return { error: result.error };
  }

  return {
    message: `Copia creada: “${result.template.display_name}”.`,
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
  revalidatePath(ROUTES.campanasNueva);

  if (!result.ok) {
    return { error: result.error };
  }

  return {
    message: `Sync Meta: ${result.total} plantilla(s) (${result.created} nuevas, ${result.updated} actualizadas).`,
  };
}
