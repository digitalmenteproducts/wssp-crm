import { z } from "zod";

export const launchCampaignSchema = z
  .object({
    name: z
      .string()
      .min(2, "El nombre de la campaña es obligatorio.")
      .max(120),
    template_id: z.string().uuid("Plantilla inválida."),
    segment_id: z.string().uuid("Segmento inválido."),
    confirm: z.string().optional(),
  })
  .refine((data) => data.confirm === "on" || data.confirm === "true", {
    message: "Debes confirmar el envío.",
    path: ["confirm"],
  });

export type LaunchCampaignInput = {
  name: string;
  template_id: string;
  segment_id: string;
  confirm?: string;
};
