import type { Metadata } from "next";
import Link from "next/link";

import { LaunchCampaignForm } from "@/components/campaigns/launch-campaign-form";
import { PageHeader } from "@/components/layout/page-header";
import { ROUTES } from "@/config/app";
import * as segmentsService from "@/services/segmentation/segments.service";
import { evaluateSegmentMembership } from "@/services/segmentation/segments.service";
import * as templatesService from "@/services/templates/templates.service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nueva campaña",
};

type NuevaCampanaPageProps = {
  searchParams?: Promise<{ segmento?: string }>;
};

export default async function NuevaCampanaPage({
  searchParams,
}: NuevaCampanaPageProps) {
  const params = searchParams ? await searchParams : {};
  const defaultSegmentId = params.segmento;

  const [templatesResult, segmentsResult] = await Promise.all([
    templatesService.listTemplatesForCurrentBusiness(),
    segmentsService.listSegmentsForCurrentBusiness(),
  ]);

  const templates = templatesResult.ok
    ? templatesResult.templates.map((template) => ({
        id: template.id,
        name: template.name,
        status: template.status,
        language: template.language,
      }))
    : [];

  const segments: Array<{ id: string; name: string; count: number }> = [];
  if (segmentsResult.ok) {
    for (const segment of segmentsResult.segments) {
      const evaluation = await evaluateSegmentMembership(segment.id);
      segments.push({
        id: segment.id,
        name: segment.name,
        count: evaluation.ok ? evaluation.matches.length : 0,
      });
    }
  }

  return (
    <>
      <PageHeader
        title="Nueva campaña"
        description="Elige un segmento y una plantilla aprobada. El envío siempre requiere tu confirmación."
        actions={
          <Link
            href={ROUTES.campanas}
            className="text-sm text-secondary hover:text-primary"
          >
            Ver historial
          </Link>
        }
      />

      {!templatesResult.ok ? (
        <p className="mb-4 text-sm text-destructive">{templatesResult.error}</p>
      ) : null}
      {!segmentsResult.ok ? (
        <p className="mb-4 text-sm text-destructive">{segmentsResult.error}</p>
      ) : null}

      <LaunchCampaignForm
        templates={templates}
        segments={segments}
        defaultSegmentId={defaultSegmentId}
      />
    </>
  );
}
