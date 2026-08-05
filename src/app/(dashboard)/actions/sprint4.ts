"use server";

import { revalidatePath } from "next/cache";

import { ROUTES } from "@/config/app";
import * as boardService from "@/services/contacts/board.service";
import * as detailService from "@/services/contacts/detail.service";
import type { ContactBoardStatus, ContactDetail, ContactTag } from "@/types";

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

export async function getContactDetailAction(input: {
  contactId: string;
}): Promise<
  { ok: true; detail: ContactDetail } | { ok: false; error: string }
> {
  return detailService.getContactDetailForCurrentBusiness(input.contactId);
}

export async function updateContactTagsAction(input: {
  contactId: string;
  tags: ContactTag[];
}): Promise<
  | { ok: true; tags: ContactTag[]; message: string }
  | { ok: false; error: string }
> {
  const result = await detailService.updateContactTagsForCurrentBusiness(input);

  revalidatePath(ROUTES.contactos);
  revalidatePath(ROUTES.segmentos);

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  return { ok: true, tags: result.tags, message: "Etiquetas guardadas." };
}
