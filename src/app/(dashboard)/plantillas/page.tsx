import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Plantillas",
};

export default function PlantillasPage() {
  return (
    <>
      <PageHeader
        title="Plantillas"
        description="Plantillas oficiales de WhatsApp. CRUD y envío en los Sprints 5–6."
      />
      <div className="rounded-xl border border-dashed border-outline-variant bg-card p-10 text-center">
        <p className="text-sm text-secondary">
          Todavía no hay plantillas. Podrás sincronizarlas desde Meta más
          adelante.
        </p>
      </div>
    </>
  );
}
