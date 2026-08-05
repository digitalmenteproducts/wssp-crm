import type { Metadata } from "next";

import { ContactBoardView } from "@/components/contacts/contact-board";
import { RunClassificationButton } from "@/components/contacts/run-classification-button";
import { PageHeader } from "@/components/layout/page-header";
import * as boardService from "@/services/contacts/board.service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contactos",
};

export default async function ContactosPage() {
  const result = await boardService.getBoardForCurrentBusiness();

  if (!result.ok) {
    return (
      <>
        <PageHeader
          title="Contactos"
          description="Pipeline de contactos WhatsApp."
        />
        <p className="text-sm text-destructive" role="alert">
          {result.error}
        </p>
      </>
    );
  }

  const { board } = result;

  return (
    <>
      <PageHeader
        title="Contactos"
        description="Tablero tipo Trello: arrastra tarjetas para cambiar el estado comercial."
        actions={<RunClassificationButton />}
      />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-outline-variant/50 bg-card p-5">
          <p className="font-mono text-xs tracking-wider text-secondary uppercase">
            Contactos
          </p>
          <p className="mt-2 font-heading text-3xl font-semibold">
            {board.totalContacts}
          </p>
        </div>
        <div className="rounded-xl border border-outline-variant/50 bg-card p-5">
          <p className="font-mono text-xs tracking-wider text-secondary uppercase">
            Mensajes
          </p>
          <p className="mt-2 font-heading text-3xl font-semibold">
            {board.messagesCount}
          </p>
        </div>
        <div className="rounded-xl border border-outline-variant/50 bg-card p-5">
          <p className="font-mono text-xs tracking-wider text-secondary uppercase">
            Analizados
          </p>
          <p className="mt-2 font-heading text-3xl font-semibold">
            {board.analyzedCount}
          </p>
        </div>
      </div>

      <ContactBoardView board={board} />
    </>
  );
}
