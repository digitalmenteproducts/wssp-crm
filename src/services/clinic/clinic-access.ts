import { hasClinicAgenda } from "@/lib/industry";
import { canManageBusiness, type AppModule } from "@/lib/permissions";
import * as accessService from "@/services/business/access.service";
import type { BusinessWorkspace } from "@/types/business";

type ClinicGate =
  | { ok: true; workspace: BusinessWorkspace }
  | { ok: false; error: string; code: "GENERIC" };

/**
 * Workspace clínico del negocio activo si el rol tiene `module`.
 * `manage`: además exige owner/admin (escrituras de agenda/servicios).
 */
export async function requireClinicWorkspace(
  module: Extract<AppModule, "agenda" | "services">,
  options: { manage?: boolean } = {},
): Promise<ClinicGate> {
  const workspace = await accessService.getWorkspaceForModule(module);
  if (!workspace.ok) {
    return { ok: false, error: workspace.error, code: "GENERIC" };
  }
  if (!hasClinicAgenda(workspace.workspace.business.industry)) {
    return {
      ok: false,
      error: "La agenda clínica no está disponible para este negocio.",
      code: "GENERIC",
    };
  }
  if (options.manage && !canManageBusiness(workspace.workspace.membership.role)) {
    return { ok: false, error: "Sin permiso de administración.", code: "GENERIC" };
  }
  return { ok: true, workspace: workspace.workspace };
}
