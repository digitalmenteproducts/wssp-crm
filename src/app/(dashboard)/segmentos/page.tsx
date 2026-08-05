import type { Metadata } from "next";

import { CreateSegmentForm } from "@/components/segments/create-segment-form";
import { PageHeader } from "@/components/layout/page-header";
import * as segmentsService from "@/services/segmentation/segments.service";
import { evaluateSegmentMembership } from "@/services/segmentation/segments.service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Segmentos",
};

export default async function SegmentosPage() {
  const list = await segmentsService.listSegmentsForCurrentBusiness();

  const cards = [];
  if (list.ok) {
    for (const segment of list.segments) {
      const evaluation = await evaluateSegmentMembership(segment.id);
      cards.push({
        segment,
        count: evaluation.ok ? evaluation.matches.length : 0,
        error: evaluation.ok ? null : evaluation.error,
      });
    }
  }

  return (
    <>
      <PageHeader
        title="Segmentos"
        description="Segmentos dinámicos por reglas sobre atributos de IA y estado comercial."
      />

      {!list.ok ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {list.error}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map(({ segment, count, error }) => (
            <div
              key={segment.id}
              className="rounded-xl border border-outline-variant/50 bg-card p-5"
            >
              <h3 className="text-lg font-semibold">{segment.name}</h3>
              <p className="mt-1 text-sm text-secondary">
                {segment.description ?? "Sin descripción"}
              </p>
              <p className="mt-4 font-heading text-3xl font-semibold">{count}</p>
              <p className="text-xs text-secondary">contactos que cumplen</p>
              {error ? (
                <p className="mt-2 text-xs text-destructive">{error}</p>
              ) : null}
              <pre className="mt-3 overflow-auto rounded-md bg-muted p-2 font-mono text-[10px] text-secondary">
                {JSON.stringify(segment.rules_json, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8">
        <CreateSegmentForm />
      </div>
    </>
  );
}
