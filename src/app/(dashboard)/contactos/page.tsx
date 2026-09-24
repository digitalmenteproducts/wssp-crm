import type { Metadata } from "next";

import { ContactBoardView } from "@/components/contacts/contact-board";
import { CreateContactButton } from "@/components/contacts/create-contact-button";
import { RunClassificationButton } from "@/components/contacts/run-classification-button";
import { PageHeader } from "@/components/layout/page-header";
import {
  contactSingularLabel,
  contactsNavLabel,
  newContactLabel,
} from "@/lib/industry";
import * as boardService from "@/services/contacts/board.service";
import * as businessService from "@/services/business/business.service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contactos",
};

export default async function ContactosPage() {
  const workspace = await businessService.getCurrentWorkspace();
  const industry =
    workspace.ok && workspace.workspace
      ? workspace.workspace.business.industry
      : "other";
  const contactsLabel = contactsNavLabel(industry);
  const singular = contactSingularLabel(industry);
  const newLabel = newContactLabel(industry);
  const result = await boardService.getBoardForCurrentBusiness();

  if (!result.ok) {
    return (
      <>
        <PageHeader
          title={contactsLabel}
          description={`Pipeline de ${contactsLabel.toLowerCase()} WhatsApp.`}
          actions={
            <CreateContactButton
              singularLabel={singular}
              newLabel={newLabel}
            />
          }
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
        title={contactsLabel}
        description={
          industry === "clinic"
            ? "Tablero de pacientes: arrastra tarjetas para cambiar el estado comercial."
            : "Tablero tipo Trello: arrastra tarjetas para cambiar el estado comercial."
        }
        actions={
          <div className="flex flex-wrap items-start gap-2">
            <CreateContactButton
              singularLabel={singular}
              newLabel={newLabel}
            />
            <RunClassificationButton />
          </div>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-outline-variant/50 bg-card p-5">
          <p className="font-mono text-xs tracking-wider text-secondary uppercase">
            {contactsLabel}
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
