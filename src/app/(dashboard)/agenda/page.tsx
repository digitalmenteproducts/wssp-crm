import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ClinicAgendaWorkspace } from "@/components/clinic/clinic-agenda-workspace";
import { PageHeader } from "@/components/layout/page-header";
import { ROUTES } from "@/config/app";
import { hasClinicAgenda } from "@/lib/industry";
import * as contactsRepository from "@/repositories/contacts.repository";
import * as appointmentService from "@/services/clinic/appointment.service";
import * as clinicServicesService from "@/services/clinic/services.service";
import * as businessService from "@/services/business/business.service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Agenda",
};

export default async function AgendaPage() {
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

  const [agenda, servicesPage] = await Promise.all([
    appointmentService.getAgendaPageData(),
    clinicServicesService.listServicesPageData(),
  ]);
  const contacts = await contactsRepository.listContactsSimple(
    workspace.workspace.business.id,
  );

  return (
    <>
      <PageHeader
        title="Agenda"
        description="Citas, profesionales, disponibilidad y bloqueos administrativos."
      />

      {!agenda.ok ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {agenda.error}
        </div>
      ) : (
        <ClinicAgendaWorkspace
          resources={agenda.data.resources}
          services={servicesPage.ok ? servicesPage.data.services : []}
          availability={agenda.data.availability}
          blocks={agenda.data.blocks}
          appointments={agenda.data.appointments}
          contacts={contacts.data ?? []}
          timezone={agenda.data.timezone}
        />
      )}
    </>
  );
}
