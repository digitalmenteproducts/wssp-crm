import { canAccessModule } from "@/lib/permissions";
import type { BusinessRole } from "@/types/business";

export const BUSINESS_ROLE_LABELS: Record<BusinessRole, string> = {
  owner: "Propietario",
  admin: "Administrador",
  professional: "Profesional",
  member: "Miembro",
};

export function businessRoleLabel(role: string): string {
  return role in BUSINESS_ROLE_LABELS
    ? BUSINESS_ROLE_LABELS[role as BusinessRole]
    : role;
}

export function canManageTeam(role: string): boolean {
  return canAccessModule(role, "team");
}

const MONTHS_ES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

/** "15 sep 2026" en la zona horaria del negocio. */
export function formatJoinedDate(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(date);
  } catch {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(date);
  }

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const month = MONTHS_ES[Number(get("month")) - 1] ?? get("month");
  return `${Number(get("day"))} ${month} ${get("year")}`;
}
