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

const STATUS_CLASS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  sending: "bg-sky-100 text-sky-800",
  completed: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
  partial: "bg-amber-100 text-amber-900",
};

export default async function CampanasPage() {
  const result = await campaignsService.listCampaignsForCurrentBusiness();

  const campaigns = result.ok ? result.campaigns : [];
  const totalSent = campaigns.reduce((sum, item) => sum + item.sent_count, 0);
  const totalFailed = campaigns.reduce(
    (sum, item) => sum + item.failed_count,
    0,
  );

  return (
    <>
      <PageHeader
        title="Campañas"
        description="Historial de todas las campañas enviadas a segmentos."
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
      ) : (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-outline-variant/50 bg-card p-5">
              <p className="font-mono text-xs tracking-wider text-secondary uppercase">
                Campañas
              </p>
              <p className="mt-2 font-heading text-3xl font-semibold">
                {campaigns.length}
              </p>
            </div>
            <div className="rounded-xl border border-outline-variant/50 bg-card p-5">
              <p className="font-mono text-xs tracking-wider text-secondary uppercase">
                Envíos ok
              </p>
              <p className="mt-2 font-heading text-3xl font-semibold">
                {totalSent}
              </p>
            </div>
            <div className="rounded-xl border border-outline-variant/50 bg-card p-5">
              <p className="font-mono text-xs tracking-wider text-secondary uppercase">
                Fallidos
              </p>
              <p className="mt-2 font-heading text-3xl font-semibold">
                {totalFailed}
              </p>
            </div>
          </div>

          {campaigns.length === 0 ? (
            <div className="rounded-xl border border-dashed border-outline-variant bg-card p-10 text-center text-sm text-secondary">
              Aún no hay campañas enviadas.{" "}
              <Link
                href={ROUTES.campanasNueva}
                className="text-primary hover:underline"
              >
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
                    <th className="px-4 py-3">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((campaign) => (
                    <tr
                      key={campaign.id}
                      className="border-b border-outline-variant/20 last:border-0"
                    >
                      <td className="px-4 py-3 font-medium">{campaign.name}</td>
                      <td className="px-4 py-3">
                        {campaign.template?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {campaign.segment?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
                            STATUS_CLASS[campaign.status] ??
                            "bg-muted text-secondary"
                          }`}
                        >
                          {STATUS_LABEL[campaign.status] ?? campaign.status}
                        </span>
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
                      <td className="px-4 py-3 text-xs text-secondary">
                        {new Date(campaign.created_at).toLocaleString("es")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
