import { createClient } from "@supabase/supabase-js";

import { getPublicEnv, getServiceRoleKey } from "@/lib/env";

/**
 * Cliente admin con service role. Solo usar en servidor
 * (webhooks, cron, jobs). Nunca importar en Client Components.
 */
export function createAdminClient() {
  const { NEXT_PUBLIC_SUPABASE_URL } = getPublicEnv();
  const serviceRoleKey = getServiceRoleKey();

  return createClient(NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
