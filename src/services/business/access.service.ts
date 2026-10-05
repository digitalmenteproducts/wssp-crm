import { redirect } from "next/navigation";

import {
  ACCESS_DENIED_MESSAGE,
  accessDeniedRoute,
  canAccessModule,
  type AppModule,
} from "@/lib/permissions";
import * as businessService from "@/services/business/business.service";
import type { BusinessWorkspace } from "@/types/business";

export type ModuleWorkspaceResult =
  | { ok: true; workspace: BusinessWorkspace }
  | { ok: false; forbidden: boolean; error: string };

/** Workspace del negocio activo solo si el rol de la membership puede usar `module`. */
export async function getWorkspaceForModule(
  module: AppModule,
): Promise<ModuleWorkspaceResult> {
  const result = await businessService.getCurrentWorkspace();
  if (!result.ok || !result.workspace) {
    return {
      ok: false,
      forbidden: false,
      error: result.ok ? "Sin empresa." : result.error,
    };
  }

  if (!canAccessModule(result.workspace.membership.role, module)) {
    return { ok: false, forbidden: true, error: ACCESS_DENIED_MESSAGE };
  }

  return { ok: true, workspace: result.workspace };
}

/** Para páginas: si el rol no tiene el módulo redirige al Panel con aviso. */
export async function requireModulePage(
  module: AppModule,
): Promise<
  { ok: true; workspace: BusinessWorkspace } | { ok: false; error: string }
> {
  const result = await getWorkspaceForModule(module);
  if (!result.ok && result.forbidden) {
    redirect(accessDeniedRoute());
  }
  return result;
}
