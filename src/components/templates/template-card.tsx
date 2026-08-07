"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { MoreVertical } from "lucide-react";

import {
  deleteTemplateAction,
  duplicateTemplateAction,
  submitTemplateAction,
  type TemplateFormState,
} from "@/app/(dashboard)/actions/sprint5";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/config/app";
import { previewTemplateContent } from "@/lib/templates/preview";
import type { Template } from "@/types/templates";

const initialState: TemplateFormState = {};

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  submitting: "Enviando…",
  pending: "En revisión",
  approved: "Aprobada",
  rejected: "Rechazada",
  paused: "Pausada",
  disabled: "Deshabilitada",
  error: "Error",
};

const STATUS_CLASS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitting: "bg-sky-100 text-sky-800",
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  paused: "bg-orange-100 text-orange-900",
  disabled: "bg-slate-200 text-slate-600",
  error: "bg-red-100 text-red-800",
};

type TemplateCardProps = {
  template: Template;
};

export function TemplateCard({ template }: TemplateCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteTemplateAction,
    initialState,
  );
  const [submitState, submitAction, submitPending] = useActionState(
    submitTemplateAction,
    initialState,
  );
  const [dupState, dupAction, dupPending] = useActionState(
    duplicateTemplateAction,
    initialState,
  );

  const feedback =
    deleteState.error ||
    deleteState.message ||
    submitState.error ||
    submitState.message ||
    dupState.error ||
    dupState.message;
  const feedbackIsError = Boolean(
    deleteState.error || submitState.error || dupState.error,
  );

  const preview = previewTemplateContent(
    template.content,
    template.variable_examples,
  );

  return (
    <article className="relative flex flex-col overflow-hidden rounded-xl border border-outline-variant/50 bg-card p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-muted px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-secondary uppercase">
            {template.category}
          </span>
          <span
            className={`rounded px-2.5 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[template.status] ?? "bg-muted text-secondary"}`}
          >
            {STATUS_LABEL[template.status] ?? template.status}
          </span>
        </div>
        <div className="relative">
          <button
            type="button"
            aria-label="Acciones"
            className="text-secondary hover:text-on-surface"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreVertical className="size-5" />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 z-10 mt-1 w-48 rounded-md border border-outline-variant bg-card p-1 shadow-md">
              {(template.status === "draft" ||
                template.status === "rejected" ||
                template.status === "error") && (
                <form action={submitAction}>
                  <input type="hidden" name="id" value={template.id} />
                  <button
                    type="submit"
                    disabled={submitPending}
                    className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                    onClick={() => setMenuOpen(false)}
                  >
                    Enviar para revisión
                  </button>
                </form>
              )}
              {(template.status === "approved" ||
                template.status === "rejected") && (
                <form action={dupAction}>
                  <input type="hidden" name="id" value={template.id} />
                  <button
                    type="submit"
                    disabled={dupPending}
                    className="w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                    onClick={() => setMenuOpen(false)}
                  >
                    Duplicar
                    {template.status === "rejected" ? " y corregir" : ""}
                  </button>
                </form>
              )}
              {template.status !== "pending" &&
              template.status !== "submitting" ? (
                <form action={deleteAction}>
                  <input type="hidden" name="id" value={template.id} />
                  <button
                    type="submit"
                    disabled={deletePending}
                    className="w-full rounded px-2 py-1.5 text-left text-xs text-destructive hover:bg-muted"
                    onClick={() => setMenuOpen(false)}
                  >
                    Eliminar
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <h3 className="mb-0.5 text-lg font-semibold">{template.display_name}</h3>
      <p className="mb-3 font-mono text-[11px] text-secondary">
        {template.name} · {template.language}
        {template.last_synced_at
          ? ` · sync ${new Date(template.last_synced_at).toLocaleString("es")}`
          : ""}
      </p>

      {template.header_text ? (
        <p className="mb-1 text-sm font-semibold">{template.header_text}</p>
      ) : null}
      <div className="mb-4 flex-1 rounded-lg border border-outline-variant/40 bg-muted/40 p-3 text-sm text-secondary line-clamp-4">
        {preview}
      </div>
      {template.footer_text ? (
        <p className="mb-3 text-xs text-secondary">{template.footer_text}</p>
      ) : null}

      {template.status === "rejected" || template.status === "error" ? (
        <p className="mb-3 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {template.rejection_reason ?? "Rechazada por Meta. Revisa y duplica para corregir."}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-2">
        {(template.status === "draft" ||
          template.status === "rejected" ||
          template.status === "error") && (
          <form action={submitAction}>
            <input type="hidden" name="id" value={template.id} />
            <Button
              type="submit"
              disabled={submitPending}
              className="h-8 bg-primary text-primary-foreground"
            >
              {submitPending ? "Enviando…" : "Enviar para revisión"}
            </Button>
          </form>
        )}
        {template.status === "approved" ? (
          <Link
            href={ROUTES.campanasNueva}
            className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary-container"
          >
            Usar en campaña
          </Link>
        ) : null}
      </div>

      {feedback ? (
        <p
          className={`mt-2 text-xs ${feedbackIsError ? "text-destructive" : "text-primary"}`}
          role={feedbackIsError ? "alert" : "status"}
        >
          {feedback}
        </p>
      ) : null}
    </article>
  );
}
