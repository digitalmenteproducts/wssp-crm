import { canManageTeam } from "@/lib/team";
import * as businessRepository from "@/repositories/business.repository";
import * as businessService from "@/services/business/business.service";
import type { BusinessMember } from "@/types/business";

export type TeamPageResult =
  | {
      ok: true;
      members: BusinessMember[];
      timezone: string;
    }
  | { ok: false; reason: "forbidden" }
  | { ok: false; reason: "error"; error: string };

/** Equipo del negocio activo. Solo owner/admin; la RPC vuelve a validarlo en la DB. */
export async function getTeamPageData(): Promise<TeamPageResult> {
  const workspace = await businessService.resolveCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return {
      ok: false,
      reason: "error",
      error: workspace.ok ? "Sin empresa." : workspace.error,
    };
  }

  const { business, membership } = workspace.workspace;
  if (!canManageTeam(membership.role)) {
    return { ok: false, reason: "forbidden" };
  }

  const result = await businessRepository.listBusinessMembers(business.id);
  if (result.forbidden) {
    return { ok: false, reason: "forbidden" };
  }
  if (result.error) {
    return { ok: false, reason: "error", error: "No se pudo cargar el equipo." };
  }

  return { ok: true, members: result.data, timezone: business.timezone };
}
