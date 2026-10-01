import { cookies } from "next/headers";

import { ACTIVE_BUSINESS_COOKIE, isUuid } from "@/lib/active-business";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function readActiveBusinessPreference(): Promise<string | null> {
  const value = (await cookies()).get(ACTIVE_BUSINESS_COOKIE)?.value ?? null;
  return isUuid(value) ? value : null;
}

/**
 * Solo persiste en Server Actions / Route Handlers; en Server Components Next
 * no permite escribir cookies y la resolución sigue siendo válida sin ella.
 */
export async function persistActiveBusiness(businessId: string): Promise<void> {
  try {
    (await cookies()).set(ACTIVE_BUSINESS_COOKIE, businessId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
    });
  } catch {
    // Server Component: solo lectura.
  }
}

export async function clearActiveBusiness(): Promise<void> {
  try {
    (await cookies()).delete(ACTIVE_BUSINESS_COOKIE);
  } catch {
    // Server Component: solo lectura.
  }
}
