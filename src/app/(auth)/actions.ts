"use server";

import { redirect } from "next/navigation";

import { ROUTES } from "@/config/app";
import { getCurrentUser } from "@/repositories/auth.repository";
import * as authService from "@/services/auth/auth.service";

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

  redirect(ROUTES.panel);
}

export async function registerAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const result = await authService.register({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  // Si la sesión ya queda activa (confirmación desactivada), ir al panel.
  const { data } = await getCurrentUser();

  if (data.user) {
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

export async function logoutAction(): Promise<void> {
  await authService.logout();
  redirect(ROUTES.login);
}
