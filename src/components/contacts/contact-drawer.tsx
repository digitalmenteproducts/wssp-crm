"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  UserX,
  X,
} from "lucide-react";

import {
  getContactDetailAction,
  moveContactAction,
  reanalyzeContactAction,
  updateContactTagsAction,
} from "@/app/(dashboard)/actions/sprint4";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROUTES } from "@/config/app";
import { formatRelativeTime, whatsappLink } from "@/lib/contacts/format";
import type {
  ContactBoardStatus,
  ContactDetail,
  ContactTag,
} from "@/types";
import { CONTACT_BOARD_LABELS, CONTACT_BOARD_STATUSES } from "@/types/contacts";

type ContactDrawerProps = {
  contactId: string | null;
  onClose: () => void;
  onStatusChange: (contactId: string, status: ContactBoardStatus) => void;
  onTagsChange: (contactId: string, tags: string[]) => void;
  onFeedback: (feedback: { error?: string; message?: string }) => void;
};

export function ContactDrawer({
  contactId,
  onClose,
  onStatusChange,
  onTagsChange,
  onFeedback,
}: ContactDrawerProps) {
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tags, setTags] = useState<ContactTag[]>([]);
  const [newTag, setNewTag] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!contactId) {
      setDetail(null);
      setLoadError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    void getContactDetailAction({ contactId }).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setLoadError(result.error);
        setDetail(null);
        return;
      }
      setDetail(result.detail);
      setTags(result.detail.tags);
    });

    return () => {
      cancelled = true;
    };
  }, [contactId]);

  useEffect(() => {
    if (!contactId) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [contactId, onClose]);

  if (!contactId) return null;

  function refreshDetail() {
    if (!contactId) return;
    setLoading(true);
    startTransition(async () => {
      const result = await getContactDetailAction({ contactId });
      setLoading(false);
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      setDetail(result.detail);
      setTags(result.detail.tags);
    });
  }

  function handleStatusChange(status: ContactBoardStatus) {
    if (!detail || status === detail.status) return;
    const previous = detail.status;
    setDetail({ ...detail, status });
    onStatusChange(detail.id, status);

    startTransition(async () => {
      const result = await moveContactAction({
        contactId: detail.id,
        status,
      });
      if (result.error) {
        setDetail({ ...detail, status: previous });
        onStatusChange(detail.id, previous);
        onFeedback({ error: result.error });
        return;
      }
      onFeedback({ message: result.message });
      refreshDetail();
    });
  }

  function handleSaveTags() {
    if (!detail) return;
    startTransition(async () => {
      const result = await updateContactTagsAction({
        contactId: detail.id,
        tags,
      });
      if (!result.ok) {
        onFeedback({ error: result.error });
        return;
      }
      setTags(result.tags);
      onTagsChange(
        detail.id,
        result.tags.map((tag) => tag.label),
      );
      onFeedback({ message: result.message });
      refreshDetail();
    });
  }

  function handleReanalyze() {
    if (!detail) return;
    startTransition(async () => {
      const result = await reanalyzeContactAction({ contactId: detail.id });
      if (result.error) {
        onFeedback({ error: result.error });
        return;
      }
      onFeedback({ message: result.message });
      refreshDetail();
    });
  }

  function addTag() {
    const label = newTag.trim();
    if (!label) return;
    if (tags.some((tag) => tag.label.toLowerCase() === label.toLowerCase())) {
      setNewTag("");
      return;
    }
    setTags([...tags, { label, source: "manual" }]);
    setNewTag("");
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Cerrar detalle"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <aside
        className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-outline-variant bg-card shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Detalle del contacto"
      >
        <header className="flex items-start justify-between gap-3 border-b border-outline-variant/50 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">
              {detail?.name ?? "Cargando…"}
            </h2>
            <p className="font-mono text-xs text-secondary">{detail?.phone}</p>
            {detail ? (
              <p className="mt-1 text-xs text-secondary">
                {CONTACT_BOARD_LABELS[detail.status]} ·{" "}
                {formatRelativeTime(detail.lastMessageAt)}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            {detail ? (
              <a
                href={whatsappLink(detail.phone)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex size-8 items-center justify-center rounded-md text-secondary hover:bg-muted hover:text-primary"
                title="Abrir WhatsApp"
              >
                <ExternalLink className="size-4" />
              </a>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex size-8 items-center justify-center rounded-md text-secondary hover:bg-muted hover:text-on-surface"
              aria-label="Cerrar"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
          {loading && !detail ? (
            <div className="flex items-center gap-2 text-sm text-secondary">
              <LoaderCircle className="size-4 animate-spin" />
              Cargando detalle…
            </div>
          ) : null}

          {loadError ? (
            <p className="text-sm text-destructive" role="alert">
              {loadError}
            </p>
          ) : null}

          {detail ? (
            <>
              <section className="space-y-2">
                <h3 className="font-mono text-xs tracking-wider text-secondary uppercase">
                  Resumen IA
                </h3>
                {detail.analysis ? (
                  <div className="space-y-2 rounded-lg border border-outline-variant/40 bg-muted/30 p-3 text-sm">
                    <p>{detail.analysis.summary ?? "Sin resumen"}</p>
                    <dl className="grid grid-cols-2 gap-2 text-xs text-secondary">
                      <div>
                        <dt className="font-mono uppercase">Producto</dt>
                        <dd className="text-on-surface">
                          {detail.analysis.product ?? "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-mono uppercase">Subcategoría</dt>
                        <dd className="text-on-surface">
                          {detail.analysis.subcategory ?? "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-mono uppercase">Intención</dt>
                        <dd className="text-on-surface">
                          {detail.analysis.intent ?? "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-mono uppercase">Confianza</dt>
                        <dd className="text-on-surface">
                          {detail.analysis.confidence != null
                            ? `${Math.round(detail.analysis.confidence * 100)}%`
                            : "—"}
                        </dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="font-mono uppercase">Motivo</dt>
                        <dd className="text-on-surface">
                          {detail.analysis.reason ?? "—"}
                        </dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="font-mono uppercase">Último análisis</dt>
                        <dd className="text-on-surface">
                          {new Date(
                            detail.analysis.created_at,
                          ).toLocaleString("es")}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ) : (
                  <p className="text-sm text-secondary">
                    Aún no hay análisis de IA para este contacto.
                  </p>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="font-mono text-xs tracking-wider text-secondary uppercase">
                  Etiquetas
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {tags.length === 0 ? (
                    <span className="text-xs text-secondary">Sin etiquetas</span>
                  ) : (
                    tags.map((tag) => (
                      <button
                        key={`${tag.source}-${tag.label}`}
                        type="button"
                        onClick={() =>
                          setTags(tags.filter((item) => item.label !== tag.label))
                        }
                        className={`rounded px-2 py-0.5 text-[11px] ${
                          tag.source === "ai"
                            ? "bg-sky-100 text-sky-800"
                            : "bg-amber-100 text-amber-900"
                        }`}
                        title="Clic para eliminar"
                      >
                        {tag.label}
                        <span className="ml-1 opacity-60">
                          {tag.source === "ai" ? "IA" : "manual"}
                        </span>
                        ×
                      </button>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newTag}
                    onChange={(event) => setNewTag(event.target.value)}
                    placeholder="Nueva etiqueta"
                    className="h-9"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addTag();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9"
                    onClick={addTag}
                  >
                    Añadir
                  </Button>
                </div>
                <Button
                  type="button"
                  className="h-9 bg-primary text-primary-foreground"
                  disabled={pending}
                  onClick={handleSaveTags}
                >
                  {pending ? "Guardando…" : "Guardar etiquetas"}
                </Button>
              </section>

              <section className="space-y-2">
                <h3 className="font-mono text-xs tracking-wider text-secondary uppercase">
                  Conversación
                </h3>
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-outline-variant/40 bg-muted/20 p-3">
                  {detail.messages.length === 0 ? (
                    <p className="text-xs text-secondary">Sin mensajes</p>
                  ) : (
                    detail.messages.map((message) => (
                      <div
                        key={message.id}
                        className={`rounded-md px-2.5 py-2 text-xs ${
                          message.direction === "inbound"
                            ? "bg-card"
                            : "bg-primary/10"
                        }`}
                      >
                        <div className="mb-1 flex justify-between gap-2 text-[10px] text-secondary">
                          <span>
                            {message.direction === "inbound"
                              ? "Cliente"
                              : "Negocio"}
                          </span>
                          <span>
                            {new Date(message.created_at).toLocaleString("es")}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap text-on-surface">
                          {message.body ?? `[${message.type}]`}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="font-mono text-xs tracking-wider text-secondary uppercase">
                  Segmentos
                </h3>
                {detail.segments.length === 0 ? (
                  <p className="text-xs text-secondary">
                    No entra en ningún segmento dinámico ahora.
                  </p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {detail.segments.map((segment) => (
                      <li
                        key={segment.id}
                        className="rounded bg-muted px-2 py-0.5 text-[11px] text-secondary"
                      >
                        {segment.name}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-3 border-t border-outline-variant/40 pt-4">
                <h3 className="font-mono text-xs tracking-wider text-secondary uppercase">
                  Acciones
                </h3>
                <div className="space-y-1.5">
                  <label className="font-mono text-[10px] text-secondary uppercase">
                    Estado comercial
                  </label>
                  <select
                    className="h-10 w-full rounded-md border border-outline-variant bg-background px-3 text-sm"
                    value={detail.status}
                    disabled={pending}
                    onChange={(event) =>
                      handleStatusChange(
                        event.target.value as ContactBoardStatus,
                      )
                    }
                  >
                    {CONTACT_BOARD_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {CONTACT_BOARD_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 justify-start gap-2"
                    disabled={pending}
                    onClick={handleReanalyze}
                  >
                    <RefreshCw className="size-4" />
                    Reanalizar con IA
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 justify-start gap-2"
                    disabled={pending}
                    onClick={() => handleStatusChange("no_contactar")}
                  >
                    <UserX className="size-4" />
                    Marcar como No contactar
                  </Button>
                  <a
                    href={whatsappLink(detail.phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center justify-start gap-2 rounded-lg border border-border bg-background px-2.5 text-sm hover:bg-muted"
                  >
                    <ExternalLink className="size-4" />
                    Abrir WhatsApp
                  </a>
                  <Link
                    href={
                      detail.similarSegmentId
                        ? `${ROUTES.campanasNueva}?segmento=${detail.similarSegmentId}`
                        : ROUTES.campanasNueva
                    }
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary-container"
                  >
                    Crear campaña para similares
                  </Link>
                </div>
              </section>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
