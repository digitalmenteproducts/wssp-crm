import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { ROUTES } from "@/config/app";
import * as campaignsService from "@/services/campaigns/campaigns.service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Campañas",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  sending: "Enviando",
  completed: "Completada",
  failed: "Fallida",
  partial: "Parcial",
};

export default async function CampanasPage() {
  const result = await campaignsService.listCampaignsForCurrentBusiness();

  return (
    <>
      <PageHeader
        title="Campañas"
        description="Historial de envíos de plantillas a segmentos."
        actions={
          <Link
            href={ROUTES.campanasNueva}
            className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary-container"
          >
            Nueva campaña
          </Link>
        }
      />

      {!result.ok ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {result.error}
        </div>
      ) : result.campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-outline-variant bg-card p-10 text-center text-sm text-secondary">
          Aún no hay campañas.{" "}
          <Link href={ROUTES.campanasNueva} className="text-primary hover:underline">
            Crear la primera
          </Link>
          .
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-outline-variant/50 bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-outline-variant/40 bg-muted/40 font-mono text-xs tracking-wider text-secondary uppercase">
              <tr>
                <th className="px-4 py-3">Campaña</th>
                <th className="px-4 py-3">Plantilla</th>
                <th className="px-4 py-3">Segmento</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Envíos</th>
              </tr>
            </thead>
            <tbody>
              {result.campaigns.map((campaign) => (
                <tr
                  key={campaign.id}
                  className="border-b border-outline-variant/20 last:border-0"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{campaign.name}</div>
                    <div className="text-xs text-secondary">
                      {new Date(campaign.created_at).toLocaleString("es")}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {campaign.template?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {campaign.segment?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {STATUS_LABEL[campaign.status] ?? campaign.status}
                    {campaign.error ? (
                      <p className="mt-1 max-w-xs text-xs text-destructive">
                        {campaign.error}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {campaign.sent_count}/{campaign.total_recipients}
                    {campaign.failed_count > 0
                      ? ` · ${campaign.failed_count} fail`
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
