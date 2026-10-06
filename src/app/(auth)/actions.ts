"use server";

import { redirect } from "next/navigation";

import { ROUTES } from "@/config/app";
import { clearActiveBusiness } from "@/lib/active-business-cookie";
import { getCurrentUser } from "@/repositories/auth.repository";
import * as authService from "@/services/auth/auth.service";
import * as businessService from "@/services/business/business.service";

export type AuthFormState = {
  error?: string;
  message?: string;
};

export async function loginAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const result = await authService.login({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  await businessService.ensureWorkspaceForUser();
  redirect(ROUTES.panel);
}

export async function registerAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const result = await authService.register({
    name,
    email,
    password,
  });

  if (!result.ok) {
    return { error: result.error };
  }

  const { data } = await getCurrentUser();

  if (data.user) {
    await businessService.ensureWorkspaceForUser({
      preferredName: name,
      supportEmail: email,
    });
    redirect(ROUTES.panel);
  }

  return { message: result.message };
}

export async function recoverAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const result = await authService.requestPasswordReset(
    {
      email: String(formData.get("email") ?? ""),
    },
    `${origin}${ROUTES.login}`,
  );

  if (!result.ok) {
    return { error: result.error };
  }

  return { message: result.message };
}

/** Cuenta del usuario de la sesión: disponible para cualquier rol. */
export async function changePasswordAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const result = await authService.changePassword({
    password: String(formData.get("password") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  });

  return result.ok ? { message: result.message } : { error: result.error };
}

export async function logoutAction(): Promise<void> {
  await authService.logout();
  await clearActiveBusiness();
  redirect(ROUTES.login);
}
