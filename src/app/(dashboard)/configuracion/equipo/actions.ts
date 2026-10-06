"use server";

import { revalidatePath } from "next/cache";

import { ROUTES } from "@/config/app";
import * as teamUsersService from "@/services/business/team-users.service";
import type { CreateUserActionResult } from "@/services/business/team-users.service";

export type CreateUserFormState = CreateUserActionResult | { ok: null };

/** Solo nombre, email y rol: el negocio se resuelve en el servidor desde la sesión. */
export async function createBusinessUserAction(
  _prevState: CreateUserFormState,
  formData: FormData,
): Promise<CreateUserFormState> {
  const result = await teamUsersService.createBusinessUserAndSendCredentials({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? ""),
  });

  if (result.ok) {
    revalidatePath(ROUTES.configuracionEquipo);
  }
  return result;
}
