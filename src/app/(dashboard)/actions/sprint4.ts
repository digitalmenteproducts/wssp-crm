"use server";

import { revalidatePath } from "next/cache";

import { ROUTES } from "@/config/app";
import * as boardService from "@/services/contacts/board.service";
import type { ContactBoardStatus } from "@/types";

export type BoardActionState = {
  error?: string;
  message?: string;
};

export async function moveContactAction(input: {
  contactId: string;
  status: ContactBoardStatus;
}): Promise<BoardActionState> {
  const result = await boardService.moveContactForCurrentBusiness(input);

  revalidatePath(ROUTES.contactos);
  revalidatePath(ROUTES.segmentos);
  revalidatePath(ROUTES.panel);

  if (!result.ok) {
    return { error: result.error };
  }

  return { message: "Estado actualizado." };
}

export async function reanalyzeContactAction(input: {
  contactId: string;
}): Promise<BoardActionState> {
  const result = await boardService.reanalyzeContactForCurrentBusiness(input);

  revalidatePath(ROUTES.contactos);
  revalidatePath(ROUTES.segmentos);
  revalidatePath(ROUTES.panel);

  if (!result.ok) {
    return { error: result.error };
  }

  return { message: "Contacto reanalizado." };
}
