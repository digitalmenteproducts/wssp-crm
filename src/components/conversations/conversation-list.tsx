import Link from "next/link";

import { ROUTES } from "@/config/app";
import {
  formatListTimestamp,
  isAiMessage,
  messagePreview,
} from "@/lib/conversations";
import { cn } from "@/lib/utils";
import type { ConversationListItem } from "@/types/conversations";

type ConversationListProps = {
  conversations: ConversationListItem[];
  selectedId: string | null;
  timezone: string;
};

function initials(name: string | null, phone: string | null): string {
  const source = name?.trim();
  if (source) {
    const parts = source.split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
  }
  return phone?.slice(-2) ?? "?";
}

export function ConversationList({
  conversations,
  selectedId,
  timezone,
}: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-secondary">
        No hay conversaciones todavía.
      </div>
    );
  }

  return (
    <ul className="flex-1 divide-y divide-outline-variant/30 overflow-y-auto">
      {conversations.map((conversation) => {
        const active = conversation.id === selectedId;
        const title =
          conversation.contact_name?.trim() ||
          conversation.contact_phone ||
          "Contacto sin nombre";
        const showPhone =
          Boolean(conversation.contact_name?.trim()) && conversation.contact_phone;
        const preview = messagePreview(
          conversation.last_message_body,
          conversation.last_message_type,
        );
        const outboundPrefix =
          conversation.last_message_direction !== "outbound"
            ? ""
            : isAiMessage("outbound", conversation.last_message_type ?? "")
              ? "IA: "
              : "Enviado: ";

        return (
          <li key={conversation.id}>
            <Link
              href={`${ROUTES.conversaciones}?c=${conversation.id}`}
              scroll={false}
              className={cn(
                "flex gap-3 px-4 py-3 transition-colors",
                active ? "bg-primary/10" : "hover:bg-muted/50",
              )}
              aria-current={active ? "page" : undefined}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                {initials(conversation.contact_name, conversation.contact_phone)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium text-on-surface">{title}</span>
                  <span className="shrink-0 text-xs text-secondary">
                    {formatListTimestamp(conversation.last_message_at, timezone)}
                  </span>
                </span>
                {showPhone ? (
                  <span className="block truncate text-xs text-secondary">
                    {conversation.contact_phone}
                  </span>
                ) : null}
                <span className="mt-0.5 block truncate text-sm text-on-surface-variant">
                  {outboundPrefix}
                  {preview}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
