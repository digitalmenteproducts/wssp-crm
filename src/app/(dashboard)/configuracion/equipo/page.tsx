import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UserPlus } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { SettingsSectionNav } from "@/components/layout/settings-section-nav";
import { TeamMembersTable } from "@/components/team/team-members-table";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/config/app";
import * as teamService from "@/services/business/team.service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Equipo",
};

export default async function EquipoPage() {
  const team = await teamService.getTeamPageData();

  if (!team.ok && team.reason === "forbidden") {
    redirect(ROUTES.configuracion);
  }

  return (
    <>
      <PageHeader
        title="Equipo"
        description="Gestiona las personas que tienen acceso a este negocio."
        actions={
          <div className="flex flex-col items-end gap-1">
            <Button disabled aria-disabled title="Disponible próximamente">
              <UserPlus />
              Invitar usuario
            </Button>
            <span className="text-xs text-secondary">Disponible próximamente</span>
          </div>
        }
      />

      <SettingsSectionNav active="equipo" />

      {!team.ok ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {team.reason === "error" ? team.error : "No se pudo cargar el equipo."}
        </div>
      ) : (
        <div className="rounded-xl border border-outline-variant/50 bg-card p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-on-surface">Miembros</h3>
          <p className="mb-6 text-sm text-on-surface-variant">
            Personas con acceso a este negocio.
          </p>
          <TeamMembersTable members={team.members} timezone={team.timezone} />
        </div>
      )}
    </>
  );
}
