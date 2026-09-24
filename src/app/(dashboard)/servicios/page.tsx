import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ClinicServicesWorkspace } from "@/components/clinic/clinic-services-workspace";
import { PageHeader } from "@/components/layout/page-header";
import { ROUTES } from "@/config/app";
import { hasClinicAgenda } from "@/lib/industry";
import * as businessService from "@/services/business/business.service";
import * as clinicServicesService from "@/services/clinic/services.service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Servicios",
};

export default async function ServiciosPage() {
  const workspace = await businessService.getCurrentWorkspace();
  if (!workspace.ok || !workspace.workspace) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {workspace.ok ? "Sin empresa." : workspace.error}
      </div>
    );
  }

  if (!hasClinicAgenda(workspace.workspace.business.industry)) {
    redirect(ROUTES.panel);
  }

  const pageData = await clinicServicesService.listServicesPageData();
  const role = workspace.workspace.membership.role;
  const canEdit = role === "owner" || role === "admin";

  return (
    <>
      <PageHeader
        title="Servicios"
        description="Tratamientos y procedimientos disponibles para agendar citas."
      />

      {!pageData.ok ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {pageData.error}
        </div>
      ) : (
        <ClinicServicesWorkspace
          services={pageData.data.services}
          resources={pageData.data.resources}
          availabilityByServiceId={pageData.data.availabilityByServiceId}
          canEdit={canEdit}
        />
      )}
    </>
  );
}
