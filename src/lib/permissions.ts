import { ROUTES } from "@/config/app";
import { BUSINESS_ROLES, type BusinessRole } from "@/types/business";

export const APP_MODULES = [
  "dashboard",
  "contacts",
  "conversations",
  "agenda",
  "services",
  "campaigns",
  "knowledge",
  "ai_agent",
  "settings",
  "team",
] as const;

export type AppModule = (typeof APP_MODULES)[number];

/**
 * Acceso por módulo (MVP, sin CRUD fino). Rol desconocido → sin acceso.
 * professional: solo Panel hasta vincular usuario ↔ recurso de agenda.
 * member (legacy): comportamiento previo (todo salvo Equipo); las escrituras
 * siguen restringidas a owner/admin por canManageBusiness y RLS.
 */
const MODULE_ACCESS: Record<BusinessRole, readonly AppModule[]> = {
  owner: APP_MODULES,
  admin: APP_MODULES,
  professional: ["dashboard"],
  member: APP_MODULES.filter((module) => module !== "team"),
};

export function isBusinessRole(role: string): role is BusinessRole {
  return (BUSINESS_ROLES as readonly string[]).includes(role);
}

export function canAccessModule(role: string, module: AppModule): boolean {
  return isBusinessRole(role) && MODULE_ACCESS[role].includes(module);
}

/** Escritura estructural del negocio (configuración, integraciones, agente, campañas, servicios, agenda). */
export function canManageBusiness(role: string): boolean {
  return role === "owner" || role === "admin";
}

export const MODULE_HOME_ROUTES: Record<AppModule, string> = {
  dashboard: ROUTES.panel,
  contacts: ROUTES.contactos,
  conversations: ROUTES.conversaciones,
  agenda: ROUTES.agenda,
  services: ROUTES.servicios,
  campaigns: ROUTES.campanas,
  knowledge: ROUTES.agenteIa,
  ai_agent: ROUTES.agenteIa,
  settings: ROUTES.configuracion,
  team: ROUTES.configuracionEquipo,
};

const ROUTE_MODULES: ReadonlyArray<readonly [string, AppModule]> = [
  [ROUTES.configuracionEquipo, "team"],
  [ROUTES.configuracion, "settings"],
  [ROUTES.panel, "dashboard"],
  [ROUTES.contactos, "contacts"],
  [ROUTES.conversaciones, "conversations"],
  [ROUTES.agenda, "agenda"],
  [ROUTES.servicios, "services"],
  [ROUTES.segmentos, "campaigns"],
  [ROUTES.plantillas, "campaigns"],
  [ROUTES.campanas, "campaigns"],
  [ROUTES.agenteIa, "ai_agent"],
];

/** Módulo que protege una ruta del dashboard (el más específico primero). */
export function moduleForPath(pathname: string): AppModule | null {
  const match = ROUTE_MODULES.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return match ? match[1] : null;
}

export const ACCESS_DENIED_PARAM = "acceso";
export const ACCESS_DENIED_MESSAGE = "No tienes acceso a esta sección.";

/** Destino cuando se deniega una ruta: el Panel con aviso (todos los roles válidos lo tienen). */
export function accessDeniedRoute(): string {
  return `${ROUTES.panel}?${ACCESS_DENIED_PARAM}=denegado`;
}
