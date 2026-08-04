import type { Metadata } from "next";

import { SettingsTabs } from "@/components/layout/settings-tabs";
import { PageHeader } from "@/components/layout/page-header";
import * as businessService from "@/services/business/business.service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Configuración",
};

export default async function ConfiguracionPage() {
  const result = await businessService.getCurrentWorkspace();
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";
  const webhookUrl = `${appUrl}/api/webhooks/whatsapp`;

  return (
    <>
      <PageHeader
        title="Configuración"
        description="Gestiona las preferencias de tu organización, conexiones API y lógica de IA."
      />

      {!result.ok || !result.workspace ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          {result.ok
            ? "No se pudo cargar el espacio de trabajo."
            : result.error}
          <p className="mt-2 text-secondary">
            Si aún no creaste las tablas, ejecuta el SQL en{" "}
            <code className="font-mono text-xs">
              supabase/migrations/20260804120000_sprint1_businesses.sql
            </code>{" "}
            desde el SQL Editor de Supabase.
          </p>
        </div>
      ) : (
        <SettingsTabs workspace={result.workspace} webhookUrl={webhookUrl} />
      )}
    </>
  );
}
