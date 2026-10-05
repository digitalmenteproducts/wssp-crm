import type { Metadata } from "next";
import Link from "next/link";

import { ConversationChat } from "@/components/conversations/conversation-chat";
import { ConversationList } from "@/components/conversations/conversation-list";
import { ROUTES } from "@/config/app";
import { cn } from "@/lib/utils";
import * as conversationsService from "@/services/conversations/conversations.service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Conversaciones",
};

type ConversacionesPageProps = {
  searchParams: Promise<{ c?: string | string[] }>;
};

export default async function ConversacionesPage({
  searchParams,
}: ConversacionesPageProps) {
  const params = await searchParams;
  const requestedId = typeof params.c === "string" ? params.c : null;
  const result = await conversationsService.getConversationsPageData(requestedId);

  if (!result.ok) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {result.error}
      </div>
    );
  }

  const hasSelection = requestedId !== null;

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[420px] overflow-hidden rounded-xl border border-outline-variant/50 bg-card shadow-sm">
      <aside
        className={cn(
          "w-full min-w-0 flex-col border-outline-variant/40 md:flex md:w-80 md:shrink-0 md:border-r lg:w-96",
          hasSelection ? "hidden" : "flex",
        )}
      >
        <div className="border-b border-outline-variant/40 px-4 py-3">
          <h1 className="font-heading text-lg font-semibold text-on-surface">Conversaciones</h1>
        </div>
        <ConversationList
          conversations={result.conversations}
          selectedId={result.selected?.id ?? null}
          timezone={result.timezone}
        />
      </aside>

      <section
        className={cn(
          "min-w-0 flex-1 flex-col md:flex",
          hasSelection ? "flex" : "hidden",
        )}
      >
        {result.selected ? (
          <ConversationChat conversation={result.selected} timezone={result.timezone} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-secondary">
            {result.selectedNotFound
              ? "La conversación no existe o no pertenece a este negocio."
              : "Selecciona una conversación para ver los mensajes."}
            <Link href={ROUTES.conversaciones} className="text-primary underline md:hidden">
              Volver a conversaciones
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
