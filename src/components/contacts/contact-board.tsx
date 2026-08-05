"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type DragEvent,
} from "react";

import { moveContactAction } from "@/app/(dashboard)/actions/sprint4";
import { ContactCard } from "@/components/contacts/contact-card";
import { ContactDrawer } from "@/components/contacts/contact-drawer";
import type { ContactBoard, ContactBoardStatus } from "@/types";
import { CONTACT_BOARD_LABELS, CONTACT_BOARD_STATUSES } from "@/types/contacts";

const COLUMN_DOT: Record<ContactBoardStatus, string> = {
  nuevo: "bg-sky-500",
  interesado: "bg-amber-500",
  no_compro: "bg-orange-500",
  cliente: "bg-emerald-500",
  no_contactar: "bg-slate-400",
};

type ContactBoardViewProps = {
  board: ContactBoard;
};

export function ContactBoardView({ board }: ContactBoardViewProps) {
  const [columns, setColumns] = useState(board.columns);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null,
  );
  const [feedback, setFeedback] = useState<{
    error?: string;
    message?: string;
  }>({});
  const [dragOverStatus, setDragOverStatus] = useState<ContactBoardStatus | null>(
    null,
  );
  const [, startTransition] = useTransition();

  useEffect(() => {
    setColumns(board.columns);
  }, [board]);

  const total = useMemo(
    () => columns.reduce((sum, column) => sum + column.cards.length, 0),
    [columns],
  );

  function moveOptimistic(contactId: string, status: ContactBoardStatus) {
    setColumns((prev) => {
      const card = prev
        .flatMap((column) => column.cards)
        .find((item) => item.id === contactId);
      if (!card) return prev;

      return CONTACT_BOARD_STATUSES.map((columnStatus) => {
        const existing =
          prev.find((column) => column.status === columnStatus)?.cards ?? [];
        const without = existing.filter((item) => item.id !== contactId);
        const cards =
          columnStatus === status
            ? [{ ...card, status }, ...without]
            : without;

        return {
          status: columnStatus,
          label: CONTACT_BOARD_LABELS[columnStatus],
          cards,
        };
      });
    });
  }

  function patchCardTags(contactId: string, tags: string[]) {
    setColumns((prev) =>
      prev.map((column) => ({
        ...column,
        cards: column.cards.map((card) =>
          card.id === contactId ? { ...card, tags: tags.slice(0, 6) } : card,
        ),
      })),
    );
  }

  function handleDrop(status: ContactBoardStatus, event: DragEvent) {
    event.preventDefault();
    setDragOverStatus(null);

    const contactId = event.dataTransfer.getData("text/contact-id");
    const fromStatus = event.dataTransfer.getData(
      "text/from-status",
    ) as ContactBoardStatus;

    if (!contactId || fromStatus === status) return;

    moveOptimistic(contactId, status);

    startTransition(async () => {
      const result = await moveContactAction({ contactId, status });
      if (result.error) {
        setFeedback({ error: result.error });
        moveOptimistic(contactId, fromStatus);
        return;
      }
      setFeedback({ message: result.message });
    });
  }

  return (
    <div className="space-y-4">
      {(feedback.error || feedback.message) && (
        <p
          className={`text-sm ${feedback.error ? "text-destructive" : "text-primary"}`}
          role={feedback.error ? "alert" : "status"}
        >
          {feedback.error ?? feedback.message}
        </p>
      )}

      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((column) => (
          <section
            key={column.status}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOverStatus(column.status);
            }}
            onDragLeave={() => setDragOverStatus(null)}
            onDrop={(event) => handleDrop(column.status, event)}
            className={`flex w-[300px] shrink-0 flex-col rounded-lg border p-3 transition-colors ${
              dragOverStatus === column.status
                ? "border-primary bg-primary/5"
                : "border-outline-variant/60 bg-muted/30"
            }`}
          >
            <header className="mb-3 flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span
                  className={`size-2 rounded-full ${COLUMN_DOT[column.status]}`}
                />
                <h3 className="font-mono text-xs tracking-wider text-on-surface uppercase">
                  {column.label}
                </h3>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-secondary">
                  {column.cards.length}
                </span>
              </div>
            </header>

            <div className="flex min-h-[120px] flex-1 flex-col gap-3">
              {column.cards.length === 0 ? (
                <div className="rounded-md border border-dashed border-outline-variant/70 px-3 py-6 text-center text-xs text-secondary">
                  {total === 0 ? "Sin contactos aún" : "Suelta aquí"}
                </div>
              ) : (
                column.cards.map((card) => (
                  <ContactCard
                    key={card.id}
                    card={card}
                    onOpen={setSelectedContactId}
                  />
                ))
              )}
            </div>
          </section>
        ))}
      </div>

      <ContactDrawer
        contactId={selectedContactId}
        onClose={() => setSelectedContactId(null)}
        onStatusChange={moveOptimistic}
        onTagsChange={patchCardTags}
        onFeedback={setFeedback}
      />
    </div>
  );
}
