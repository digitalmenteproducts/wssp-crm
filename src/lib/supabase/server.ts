import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getPublicEnv } from "@/lib/env";

/**
 * Cliente de Supabase para Server Components, Route Handlers y Server Actions.
 * Respeta la sesión del usuario vía cookies.
 */
export async function createClient() {
  // cookies() primero: marca la ruta como dinámica antes de validar env.
  const cookieStore = await cookies();
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } =
    getPublicEnv();

  return createServerClient(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll puede fallar en Server Components de solo lectura;
            // el middleware se encarga de refrescar la sesión.
          }
        },
      },
    },
  );
}
