import type { Metadata } from "next";

import { RunClassificationButton } from "@/components/contacts/run-classification-button";
import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";
import * as businessService from "@/services/business/business.service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contactos",
};

export default async function ContactosPage() {
  const workspace = await businessService.getCurrentWorkspace();
  let contacts: Array<{
    id: string;
    phone: string;
    name: string | null;
    status: string;
    created_at: string;
  }> = [];
  let analysesByContact = new Map<
    string,
    { summary: string | null; product: string | null; confidence: number | null }
  >();
  let messagesCount = 0;
  let analyzedCount = 0;

  if (workspace.ok && workspace.workspace) {
    const supabase = await createClient();
    const businessId = workspace.workspace.business.id;

    const [contactsResult, messagesResult, analyzedResult, analysesResult] =
      await Promise.all([
        supabase
          .from("contacts")
          .select("id, phone, name, status, created_at")
          .eq("business_id", businessId)
          .order("created_at", { ascending: false }),
        supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("business_id", businessId),
        supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("business_id", businessId)
          .eq("ai_status", "analizado"),
        supabase
          .from("ai_analysis")
          .select("contact_id, summary, product, confidence, created_at")
          .eq("business_id", businessId)
          .order("created_at", { ascending: false }),
      ]);

    contacts = contactsResult.data ?? [];
    messagesCount = messagesResult.count ?? 0;
    analyzedCount = analyzedResult.count ?? 0;

    for (const row of analysesResult.data ?? []) {
      if (!analysesByContact.has(row.contact_id)) {
        analysesByContact.set(row.contact_id, {
          summary: row.summary,
          product: row.product,
          confidence: row.confidence,
        });
      }
    }
  }

  return (
    <>
      <PageHeader
        title="Contactos"
        description="Contactos de WhatsApp con clasificación de IA. El tablero Trello llega en el Sprint 4."
        actions={<RunClassificationButton />}
      />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-outline-variant/50 bg-card p-5">
          <p className="font-mono text-xs tracking-wider text-secondary uppercase">
            Contactos
          </p>
          <p className="mt-2 font-heading text-3xl font-semibold">
            {contacts.length}
          </p>
        </div>
        <div className="rounded-xl border border-outline-variant/50 bg-card p-5">
          <p className="font-mono text-xs tracking-wider text-secondary uppercase">
            Mensajes
          </p>
          <p className="mt-2 font-heading text-3xl font-semibold">
            {messagesCount}
          </p>
        </div>
        <div className="rounded-xl border border-outline-variant/50 bg-card p-5">
          <p className="font-mono text-xs tracking-wider text-secondary uppercase">
            Analizados
          </p>
          <p className="mt-2 font-heading text-3xl font-semibold">
            {analyzedCount}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant/50 bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-outline-variant/40 bg-muted/40 font-mono text-xs tracking-wider text-secondary uppercase">
            <tr>
              <th className="px-4 py-3">Contacto</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Producto IA</th>
              <th className="px-4 py-3">Resumen</th>
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-secondary"
                >
                  Aún no hay contactos. Envía un WhatsApp al número de prueba.
                </td>
              </tr>
            ) : (
              contacts.map((contact) => {
                const analysis = analysesByContact.get(contact.id);
                return (
                  <tr
                    key={contact.id}
                    className="border-b border-outline-variant/20 last:border-0"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {contact.name ?? "Sin nombre"}
                      </div>
                      <div className="font-mono text-xs text-secondary">
                        {contact.phone}
                      </div>
                    </td>
                    <td className="px-4 py-3">{contact.status}</td>
                    <td className="px-4 py-3">
                      {analysis?.product ?? "—"}
                      {analysis?.confidence != null ? (
                        <span className="ml-2 text-xs text-secondary">
                          ({Math.round(Number(analysis.confidence) * 100)}%)
                        </span>
                      ) : null}
                    </td>
                    <td className="max-w-md px-4 py-3 text-secondary">
                      {analysis?.summary ?? "Sin analizar"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
