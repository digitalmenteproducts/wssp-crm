"use server";

import { revalidatePath } from "next/cache";

import { ROUTES } from "@/config/app";
import * as businessService from "@/services/business/business.service";

export type SettingsFormState = {
  error?: string;
  message?: string;
};

export async function updateGeneralAction(
  _prevState: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const result = await businessService.updateGeneral({
    name: String(formData.get("name") ?? ""),
    support_email: String(formData.get("support_email") ?? ""),
    timezone: String(formData.get("timezone") ?? ""),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(ROUTES.configuracion);
  return { message: result.message };
}

export async function updateIntegrationsAction(
  _prevState: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const result = await businessService.updateIntegrations({
    openai_api_key: String(formData.get("openai_api_key") ?? ""),
    whatsapp_access_token: String(formData.get("whatsapp_access_token") ?? ""),
    whatsapp_phone_number_id: String(
      formData.get("whatsapp_phone_number_id") ?? "",
    ),
    whatsapp_business_account_id: String(
      formData.get("whatsapp_business_account_id") ?? "",
    ),
    whatsapp_verify_token: String(formData.get("whatsapp_verify_token") ?? ""),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(ROUTES.configuracion);
  return { message: result.message };
}

export async function updateAiAction(
  _prevState: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const result = await businessService.updateAi({
    ai_engine_enabled: formData.get("ai_engine_enabled") === "on",
    classification_prompt: String(formData.get("classification_prompt") ?? ""),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath(ROUTES.configuracion);
  return { message: result.message };
}
