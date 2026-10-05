import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { ROUTES } from "@/config/app";
import {
  CONVERSATION_MESSAGES_LIMIT,
  formatDayLabel,
  formatMessageTime,
  messageDayKey,
  messageDisplayText,
} from "@/lib/conversations";
import { cn } from "@/lib/utils";
import type { SelectedConversation } from "@/types/conversations";

type ConversationChatProps = {
  conversation: SelectedConversation;
  timezone: string;
};

export function ConversationChat({ conversation, timezone }: ConversationChatProps) {
  const title =
    conversation.contact_name?.trim() ||
    conversation.contact_phone ||
    "Contacto sin nombre";
  const showPhone =
    Boolean(conversation.contact_name?.trim()) && conversation.contact_phone;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-outline-variant/40 px-4 py-3">
        <Link
          href={ROUTES.conversaciones}
          className="rounded-md p-1 text-secondary hover:bg-muted md:hidden"
          aria-label="Volver a conversaciones"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0">
          <p className="truncate font-semibold text-on-surface">{title}</p>
          {showPhone ? (
            <p className="truncate text-xs text-secondary">{conversation.contact_phone}</p>
          ) : null}
        </div>
      </header>

      {/* flex-col-reverse: el scroll arranca abajo (último mensaje) sin JS. */}
      <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto bg-muted/30 px-4 py-4">
        <div className="flex flex-col gap-2">
          {conversation.messages.length >= CONVERSATION_MESSAGES_LIMIT ? (
            <p className="text-center text-xs text-secondary">
              Mostrando los últimos {CONVERSATION_MESSAGES_LIMIT} mensajes.
            </p>
          ) : null}
          {conversation.messages.length === 0 ? (
            <p className="text-center text-sm text-secondary">
              Esta conversación no tiene mensajes.
            </p>
          ) : null}
          {conversation.messages.map((message, index) => {
            const previous = conversation.messages[index - 1];
            const showDay =
              !previous ||
              messageDayKey(previous.created_at, timezone) !==
                messageDayKey(message.created_at, timezone);
            const outbound = message.direction === "outbound";

            return (
              <div key={message.id} className="flex flex-col gap-2">
                {showDay ? (
                  <div className="my-2 flex justify-center">
                    <span className="rounded-full bg-card px-3 py-1 text-xs text-secondary shadow-sm">
                      {formatDayLabel(message.created_at, timezone)}
                    </span>
                  </div>
                ) : null}
                <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm md:max-w-[65%]",
                      outbound
                        ? "rounded-br-sm bg-primary text-primary-foreground"
                        : "rounded-bl-sm bg-card text-on-surface",
                    )}
                  >
                    <p className="break-words whitespace-pre-wrap">
                      {messageDisplayText(message.body, message.type)}
                    </p>
                    <div
                      className={cn(
                        "mt-1 flex items-center justify-end gap-1.5 text-[11px]",
                        outbound ? "text-primary-foreground/75" : "text-secondary",
                      )}
                    >
                      {message.is_simulation ? (
                        <span
                          className="rounded bg-amber-100 px-1.5 py-px font-semibold text-amber-800"
                          title="Generado por el simulador de pruebas; no se envió por WhatsApp."
                        >
                          Simulación
                        </span>
                      ) : null}
                      {message.is_ai ? (
                        <span
                          className={cn(
                            "rounded px-1.5 py-px font-semibold",
                            outbound ? "bg-white/20" : "bg-primary/10 text-primary",
                          )}
                        >
                          IA
                        </span>
                      ) : null}
                      <span>{formatMessageTime(message.created_at, timezone)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
