"use server";

import { revalidatePath } from "next/cache";

import { ROUTES } from "@/config/app";
import * as campaignsService from "@/services/campaigns/campaigns.service";

export type CampaignFormState = {
  error?: string;
  message?: string;
};

export async function launchCampaignAction(
  _prev: CampaignFormState,
  formData: FormData,
): Promise<CampaignFormState> {
  const result = await campaignsService.launchCampaignForCurrentBusiness({
    name: String(formData.get("name") ?? ""),
    template_id: String(formData.get("template_id") ?? ""),
    segment_id: String(formData.get("segment_id") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  });

  revalidatePath(ROUTES.campanas);
  revalidatePath(ROUTES.campanasNueva);
  revalidatePath(ROUTES.contactos);
  revalidatePath(ROUTES.panel);

  if (!result.ok) {
    return { error: result.error };
  }

  return {
    message: `Campaña enviada: ${result.sent}/${result.total} ok, ${result.failed} error(es).`,
  };
}
