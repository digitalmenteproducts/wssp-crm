import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Contactos",
};

export default function ContactosPage() {
  return (
    <>
      <PageHeader
        title="Contactos"
        description="Tablero tipo Trello con clasificación comercial. Llega en el Sprint 4."
      />
      <div className="rounded-xl border border-dashed border-outline-variant bg-card p-10 text-center">
        <p className="text-sm text-secondary">
          Aún no hay contactos. Se sincronizarán desde WhatsApp en el Sprint 2.
        </p>
      </div>
    </>
  );
}
