import {
  loginSchema,
  recoverSchema,
  registerSchema,
  type LoginInput,
  type RecoverInput,
  type RegisterInput,
} from "@/schemas/auth";
import * as authRepository from "@/repositories/auth.repository";

export type AuthActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

function formatZodIssues(error: { issues: { message: string }[] }): string {
  return error.issues.map((issue) => issue.message).join(" ");
}

function mapSupabaseAuthError(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "Correo o contraseña incorrectos.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Debes confirmar tu correo antes de iniciar sesión.";
  }

  if (normalized.includes("user already registered")) {
    return "Ya existe una cuenta con este correo.";
  }

  if (normalized.includes("rate limit")) {
    return "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
  }

  return "No se pudo completar la operación. Inténtalo de nuevo.";
}

export async function login(input: LoginInput): Promise<AuthActionResult> {
  const parsed = loginSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: formatZodIssues(parsed.error) };
  }

  const { error } = await authRepository.signInWithPassword(parsed.data);

  if (error) {
    return { ok: false, error: mapSupabaseAuthError(error.message) };
  }

  return { ok: true };
}

export async function register(
  input: RegisterInput,
): Promise<AuthActionResult> {
  const parsed = registerSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: formatZodIssues(parsed.error) };
  }

  const { error } = await authRepository.signUpWithPassword(parsed.data);

  if (error) {
    return { ok: false, error: mapSupabaseAuthError(error.message) };
  }

  return {
    ok: true,
    message:
      "Cuenta creada. Si tu proyecto exige confirmación, revisa tu correo.",
  };
}

export async function requestPasswordReset(
  input: RecoverInput,
  redirectTo: string,
): Promise<AuthActionResult> {
  const parsed = recoverSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: formatZodIssues(parsed.error) };
  }

  const { error } = await authRepository.resetPasswordForEmail(
    parsed.data,
    redirectTo,
  );

  if (error) {
    return { ok: false, error: mapSupabaseAuthError(error.message) };
  }

  return {
    ok: true,
    message:
      "Si el correo existe, te enviamos instrucciones para restablecer la contraseña.",
  };
}

export async function logout(): Promise<AuthActionResult> {
  const { error } = await authRepository.signOut();

  if (error) {
    return { ok: false, error: mapSupabaseAuthError(error.message) };
  }

  return { ok: true };
}
