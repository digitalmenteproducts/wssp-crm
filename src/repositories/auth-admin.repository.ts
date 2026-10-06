import { createAdminClient } from "@/lib/supabase/admin";

export type CreateAuthUserResult =
  | { userId: string; error: null }
  | { userId: null; error: "email_exists" | "failed" };

/**
 * Supabase Admin (service role, solo servidor). Crea el auth user con el email ya confirmado
 * para que pueda entrar por /login. Supabase Auth guarda la contraseña (hash); nosotros no.
 */
export async function createConfirmedUser(input: {
  email: string;
  password: string;
  name: string;
}): Promise<CreateAuthUserResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name },
  });

  if (error || !data.user) {
    const exists =
      error?.code === "email_exists" ||
      error?.code === "user_already_exists" ||
      /already been registered|already registered|already exists/i.test(error?.message ?? "");
    return { userId: null, error: exists ? "email_exists" : "failed" };
  }
  return { userId: data.user.id, error: null };
}

/** Compensación: si no se pudo crear la membership, no dejar un auth user huérfano. */
export async function deleteUser(userId: string): Promise<{ error: string | null }> {
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  return { error: error?.code ?? null };
}
