import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = {
  title: "Segmentos",
};

export default function SegmentosPage() {
  return (
    <>
      <PageHeader
        title="Segmentos"
        description="Segmentos dinámicos basados en reglas. Se activan con la IA en el Sprint 3."
      />
      <div className="rounded-xl border border-dashed border-outline-variant bg-card p-10 text-center">
        <p className="text-sm text-secondary">
          Todavía no hay segmentos configurados.
        </p>
      </div>
    </>
  );
}
