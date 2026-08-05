"use client";

import { useRef, type DragEvent, type MouseEvent } from "react";
import { MessageCircle } from "lucide-react";

import { formatRelativeTime } from "@/lib/contacts/format";
import type { ContactBoardCard } from "@/types";

type ContactCardProps = {
  card: ContactBoardCard;
  onOpen: (contactId: string) => void;
};

export function ContactCard({ card, onOpen }: ContactCardProps) {
  const dragMovedRef = useRef(false);

  function handleDragStart(event: DragEvent<HTMLDivElement>) {
    dragMovedRef.current = true;
    event.dataTransfer.setData("text/contact-id", card.id);
    event.dataTransfer.setData("text/from-status", card.status);
    event.dataTransfer.effectAllowed = "move";
  }

  function handleDragEnd() {
    // Evita que el click post-drag abra el drawer.
    window.setTimeout(() => {
      dragMovedRef.current = false;
    }, 0);
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (dragMovedRef.current) return;
    event.preventDefault();
    onOpen(card.id);
  }

  const badge = card.product ?? card.segment ?? card.tags[0] ?? "Sin producto";
  const snippet =
    card.summary ?? card.lastMessageBody ?? "Sin mensajes ni análisis aún.";

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(card.id);
        }
      }}
      className="group relative cursor-pointer rounded-md border border-outline-variant bg-card p-3 shadow-sm transition-colors hover:border-primary active:cursor-grabbing"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-primary uppercase">
          {badge}
        </span>
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
