"use client";

import { useState, useTransition, type DragEvent } from "react";
import {
  ExternalLink,
  MessageCircle,
  MoreHorizontal,
  RefreshCw,
} from "lucide-react";

import {
  moveContactAction,
  reanalyzeContactAction,
} from "@/app/(dashboard)/actions/sprint4";
import { formatRelativeTime, whatsappLink } from "@/lib/contacts/format";
import type { ContactBoardCard, ContactBoardStatus } from "@/types";
import { CONTACT_BOARD_LABELS, CONTACT_BOARD_STATUSES } from "@/types/contacts";

type ContactCardProps = {
  card: ContactBoardCard;
  onOptimisticMove: (contactId: string, status: ContactBoardStatus) => void;
  onError: (message: string) => void;
  onMessage: (message: string) => void;
};

export function ContactCard({
  card,
  onOptimisticMove,
  onError,
  onMessage,
}: ContactCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleDragStart(event: DragEvent<HTMLDivElement>) {
    event.dataTransfer.setData("text/contact-id", card.id);
    event.dataTransfer.setData("text/from-status", card.status);
    event.dataTransfer.effectAllowed = "move";
  }

  function handleStatusChange(status: ContactBoardStatus) {
    if (status === card.status) {
      setMenuOpen(false);
      return;
    }

    onOptimisticMove(card.id, status);
    setMenuOpen(false);

    startTransition(async () => {
      const result = await moveContactAction({ contactId: card.id, status });
      if (result.error) {
        onError(result.error);
        onOptimisticMove(card.id, card.status);
        return;
      }
      if (result.message) onMessage(result.message);
    });
  }

  function handleReanalyze() {
    setMenuOpen(false);
    startTransition(async () => {
      const result = await reanalyzeContactAction({ contactId: card.id });
      if (result.error) {
        onError(result.error);
        return;
      }
      if (result.message) onMessage(result.message);
    });
  }

  const badge = card.product ?? card.segment ?? "Sin clasificar";
  const snippet =
    card.summary ?? card.lastMessageBody ?? "Sin mensajes ni análisis aún.";

  return (
    <div
      draggable={!pending}
      onDragStart={handleDragStart}
      className={`group relative rounded-md border border-outline-variant bg-card p-3 shadow-sm transition-colors hover:border-primary ${
        pending ? "opacity-60" : "cursor-grab active:cursor-grabbing"
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-primary uppercase">
          {badge}
        </span>
        <div className="relative">
          <button
            type="button"
            aria-label="Acciones del contacto"
            className="text-secondary hover:text-primary"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreHorizontal className="size-4" />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-outline-variant bg-card p-1 shadow-md">
              <label className="block px-2 py-1.5 text-[10px] font-mono tracking-wider text-secondary uppercase">
                Clasificación
              </label>
              <select
                className="mb-1 w-full rounded border border-outline-variant bg-background px-2 py-1.5 text-xs"
                value={card.status}
                onChange={(event) =>
                  handleStatusChange(event.target.value as ContactBoardStatus)
                }
              >
                {CONTACT_BOARD_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {CONTACT_BOARD_LABELS[status]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                onClick={handleReanalyze}
                disabled={pending}
              >
                <RefreshCw className="size-3.5" />
                Reanalizar IA
              </button>
              <a
                href={whatsappLink(card.phone)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                onClick={() => setMenuOpen(false)}
              >
                <ExternalLink className="size-3.5" />
                Abrir WhatsApp
              </a>
            </div>
          ) : null}
        </div>
      </div>

      <h4 className="mb-0.5 text-sm font-semibold text-on-surface">
        {card.name ?? "Sin nombre"}
      </h4>
      <p className="mb-2 font-mono text-xs text-secondary">{card.phone}</p>

      <p className="mb-3 line-clamp-2 text-xs text-secondary">{snippet}</p>

      {card.tags.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-1">
          {card.tags.map((tag) => (
            <span
              key={tag}
              className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-secondary"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between text-[11px] text-secondary">
        <span className="inline-flex items-center gap-1">
          <MessageCircle className="size-3.5" />
          {formatRelativeTime(card.lastMessageAt)}
        </span>
        {card.confidence != null ? (
          <span>{Math.round(card.confidence * 100)}%</span>
        ) : null}
      </div>
    </div>
  );
}
