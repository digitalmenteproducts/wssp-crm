import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Configuración",
};

export default function ConfiguracionPage() {
  return (
    <>
      <PageHeader
        title="Configuración"
        description="API keys, WhatsApp, webhook y prompt de clasificación."
      />
      <div className="rounded-xl border border-dashed border-outline-variant bg-card p-10 text-center">
        <p className="text-sm text-secondary">
          Formulario de configuración en el siguiente paso del Sprint 1
          (empresas e integraciones).
        </p>
      </div>
    </>
  );
}
