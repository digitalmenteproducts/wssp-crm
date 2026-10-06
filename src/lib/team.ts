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

/** Roles que owner/admin pueden asignar al crear usuarios (owner y member quedan fuera). */
export const CREATABLE_ROLES = ["admin", "professional"] as const satisfies readonly BusinessRole[];
export type CreatableRole = (typeof CREATABLE_ROLES)[number];

/** Texto que el creador copia y comparte manualmente con el nuevo usuario. */
export function formatCredentialsForCopy(input: {
  loginUrl: string;
  email: string;
  temporaryPassword: string;
}): string {
  return [
    "Acceso al sistema",
    `URL: ${input.loginUrl}`,
    `Email: ${input.email}`,
    `Contraseña temporal: ${input.temporaryPassword}`,
  ].join("\n");
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
