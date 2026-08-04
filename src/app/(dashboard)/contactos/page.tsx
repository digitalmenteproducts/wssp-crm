import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";
import * as businessService from "@/services/business/business.service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contactos",
};

export default async function ContactosPage() {
  const workspace = await businessService.getCurrentWorkspace();
  let contactsCount = 0;
  let messagesCount = 0;

  if (workspace.ok && workspace.workspace) {
    const supabase = await createClient();
    const businessId = workspace.workspace.business.id;

    const [contactsResult, messagesResult] = await Promise.all([
      supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId),
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId),
    ]);

    contactsCount = contactsResult.count ?? 0;
    messagesCount = messagesResult.count ?? 0;
  }

  return (
    <>
      <PageHeader
        title="Contactos"
        description="Contactos sincronizados desde WhatsApp. El tablero Trello llega en el Sprint 4."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-outline-variant/50 bg-card p-6">
          <p className="font-mono text-xs tracking-wider text-secondary uppercase">
            Contactos
          </p>
          <p className="mt-2 font-heading text-3xl font-semibold">
            {contactsCount}
          </p>
        </div>
        <div className="rounded-xl border border-outline-variant/50 bg-card p-6">
          <p className="font-mono text-xs tracking-wider text-secondary uppercase">
            Mensajes
          </p>
          <p className="mt-2 font-heading text-3xl font-semibold">
            {messagesCount}
          </p>
        </div>
      </div>
      <div className="mt-6 rounded-xl border border-dashed border-outline-variant bg-card p-6 text-sm text-secondary">
        Webhook activo en{" "}
        <code className="font-mono text-xs">/api/webhooks/whatsapp</code>.
        Configura Phone Number ID + Verify Token en Integraciones para empezar a
        recibir mensajes.
      </div>
    </>
  );
}
