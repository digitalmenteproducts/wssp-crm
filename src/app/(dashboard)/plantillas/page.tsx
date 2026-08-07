import type { Metadata } from "next";

import { CreateTemplateForm } from "@/components/templates/create-template-form";
import { SyncTemplatesButton } from "@/components/templates/sync-templates-button";
import { TemplatesLibrary } from "@/components/templates/templates-library";
import { PageHeader } from "@/components/layout/page-header";
import * as segmentsService from "@/services/segmentation/segments.service";
import * as templatesService from "@/services/templates/templates.service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Plantillas",
};

export default async function PlantillasPage() {
  const [templatesResult, segmentsResult] = await Promise.all([
    templatesService.listTemplatesForCurrentBusiness(),
    segmentsService.listSegmentsForCurrentBusiness(),
  ]);

  const segments = segmentsResult.ok
    ? segmentsResult.segments.map((segment) => ({
        id: segment.id,
        name: segment.name,
      }))
    : [];

  return (
    <>
      <PageHeader
        title="Biblioteca de Plantillas"
        description="Crea plantillas manualmente, envíalas a Meta para revisión y sincroniza su estado. Meta es quien aprueba."
        actions={<SyncTemplatesButton />}
      />

      <div className="mb-6">
        <CreateTemplateForm segments={segments} />
      </div>

      {!templatesResult.ok ? (
        <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {templatesResult.error}
        </div>
      ) : (
        <TemplatesLibrary
          templates={templatesResult.templates}
          segments={segments}
        />
      )}
    </>
  );
}
