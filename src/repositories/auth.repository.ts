import type { LoginInput, RecoverInput, RegisterInput } from "@/schemas/auth";
import { createClient } from "@/lib/supabase/server";

export async function signInWithPassword(input: LoginInput) {
  const supabase = await createClient();

  return supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
}

export async function signUpWithPassword(input: RegisterInput) {
  const supabase = await createClient();

  return supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        name: input.name,
      },
    },
  });
}

export async function resetPasswordForEmail(
  input: RecoverInput,
  redirectTo: string,
) {
  const supabase = await createClient();

  return supabase.auth.resetPasswordForEmail(input.email, {
    redirectTo,
  });
}

export async function getCurrentUser() {
  const supabase = await createClient();

  return supabase.auth.getUser();
}

export async function signOut() {
  const supabase = await createClient();

  return supabase.auth.signOut();
}
