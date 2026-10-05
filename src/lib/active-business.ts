import type { BusinessRole, BusinessUser } from "@/types/business";

/**
 * Preferencia de negocio activo. La cookie NO concede acceso: solo se usa si
 * coincide con una membership del usuario autenticado.
 */
export const ACTIVE_BUSINESS_COOKIE = "active_business_id";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

const ROLE_PRIORITY: Record<BusinessRole, number> = {
  owner: 0,
  admin: 1,
  member: 2,
  professional: 3,
};

export type ActiveMembershipSource = "preferred" | "single" | "fallback";

export type ActiveMembershipSelection = {
  membership: BusinessUser;
  source: ActiveMembershipSource;
  /** Había preferencia pero no corresponde a ninguna membership del usuario. */
  preferenceRejected: boolean;
};

/**
 * Elige la membership activa entre las del usuario autenticado.
 * `memberships` debe venir filtrado por el user_id de la sesión (nunca del cliente).
 * Fallback determinista: owner > admin > member > professional, luego más antigua, luego business_id.
 */
export function selectActiveMembership(
  memberships: readonly BusinessUser[],
  preferredBusinessId: string | null | undefined,
): ActiveMembershipSelection | null {
  if (memberships.length === 0) {
    return null;
  }

  const hasPreference = Boolean(preferredBusinessId);
  const preferred = isUuid(preferredBusinessId)
    ? memberships.find(
        (m) => m.business_id.toLowerCase() === preferredBusinessId.toLowerCase(),
      )
    : undefined;

  if (preferred) {
    return { membership: preferred, source: "preferred", preferenceRejected: false };
  }

  if (memberships.length === 1) {
    return {
      membership: memberships[0],
      source: "single",
      preferenceRejected: hasPreference,
    };
  }

  const [first] = [...memberships].sort((a, b) => {
    const byRole = (ROLE_PRIORITY[a.role] ?? 99) - (ROLE_PRIORITY[b.role] ?? 99);
    if (byRole !== 0) return byRole;
    const byDate =
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (byDate !== 0) return byDate;
    return a.business_id.localeCompare(b.business_id);
  });

  return { membership: first, source: "fallback", preferenceRejected: hasPreference };
}
