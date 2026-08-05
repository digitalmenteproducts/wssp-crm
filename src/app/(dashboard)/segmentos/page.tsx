import type { Metadata } from "next";

import { CreateManualSegmentForm } from "@/components/segments/create-manual-segment-form";
import { SegmentsLibrary } from "@/components/segments/segments-library";
import { SyncAiSegmentsButton } from "@/components/segments/sync-ai-segments-button";
import { PageHeader } from "@/components/layout/page-header";
import * as segmentsService from "@/services/segmentation/segments.service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Segmentos",
};

export default async function SegmentosPage() {
  const list = await segmentsService.listSegmentCardsForCurrentBusiness();

  return (
    <>
      <PageHeader
        title="Segmentos"
        description="Segmentos dinámicos por reglas: la IA propone audiencias útiles; tú confirmas las campañas."
        actions={<SyncAiSegmentsButton />}
      />

      {!list.ok ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {list.error}
        </div>
      ) : (
        <SegmentsLibrary cards={list.cards} />
      )}

      <div className="mt-8">
        <CreateManualSegmentForm />
      </div>
    </>
  );
}
