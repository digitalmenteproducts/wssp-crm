"use client";

import { useActionState, useState } from "react";
import { Eye, MoreVertical, Pencil, Trash2 } from "lucide-react";

import {
  assignTemplateSegmentAction,
  deleteTemplateAction,
  updateTemplateAction,
  type TemplateFormState,
} from "@/app/(dashboard)/actions/sprint5";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { previewTemplateContent } from "@/lib/templates/preview";
import type { Template } from "@/types/templates";

const initialState: TemplateFormState = {};

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
  paused: "Pausada",
  disabled: "Deshabilitada",
};

type TemplateCardProps = {
  template: Template;
  segments: Array<{ id: string; name: string }>;
};

export function TemplateCard({ template, segments }: TemplateCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState<"view" | "edit" | "preview">("view");
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteTemplateAction,
    initialState,
  );
  const [updateState, updateAction, updatePending] = useActionState(
    updateTemplateAction,
    initialState,
  );
  const [assignState, assignAction, assignPending] = useActionState(
    assignTemplateSegmentAction,
    initialState,
  );

  const feedback =
    deleteState.error ||
    deleteState.message ||
    updateState.error ||
    updateState.message ||
    assignState.error ||
    assignState.message;

  const feedbackIsError = Boolean(
    deleteState.error || updateState.error || assignState.error,
  );

  return (
    <article className="relative flex flex-col overflow-hidden rounded-xl border border-outline-variant/50 bg-card p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-muted px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-secondary uppercase">
            {template.category}
          </span>
          <span className="rounded bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold text-primary">
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
            <div className="absolute right-0 z-10 mt-1 w-40 rounded-md border border-outline-variant bg-card p-1 shadow-md">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                onClick={() => {
                  setMode("preview");
                  setMenuOpen(false);
                }}
              >
                <Eye className="size-3.5" />
                Previsualizar
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                onClick={() => {
                  setMode("edit");
                  setMenuOpen(false);
                }}
              >
                <Pencil className="size-3.5" />
                Editar
              </button>
              <form action={deleteAction}>
                <input type="hidden" name="id" value={template.id} />
                <button
                  type="submit"
                  disabled={deletePending}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-destructive hover:bg-muted"
                  onClick={() => setMenuOpen(false)}
                >
                  <Trash2 className="size-3.5" />
                  Eliminar
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </div>

      <h3 className="mb-1 text-lg font-semibold">{template.name}</h3>
      <p className="mb-3 font-mono text-[11px] text-secondary">
        {template.language}
        {template.segment?.name ? ` · ${template.segment.name}` : ""}
      </p>

      {mode === "preview" ? (
        <div className="mb-4 flex-1 rounded-lg border border-outline-variant/40 bg-muted/40 p-3 text-sm text-secondary">
          <p className="mb-2 font-mono text-[10px] tracking-wider uppercase">
            Preview
          </p>
          {previewTemplateContent(template.content)}
          <button
            type="button"
            className="mt-3 text-xs text-primary hover:underline"
            onClick={() => setMode("view")}
          >
            Cerrar preview
          </button>
        </div>
      ) : mode === "edit" ? (
        <form action={updateAction} className="mb-4 space-y-3">
          <input type="hidden" name="id" value={template.id} />
          <div className="space-y-1">
            <Label className="font-mono text-[10px] uppercase">Nombre</Label>
            <Input
              name="name"
              defaultValue={template.name}
              className="h-9 font-mono text-sm"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="font-mono text-[10px] uppercase">Categoría</Label>
              <Input
                name="category"
                defaultValue={template.category}
                className="h-9"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="font-mono text-[10px] uppercase">Idioma</Label>
              <Input
                name="language"
                defaultValue={template.language}
                className="h-9"
                required
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="font-mono text-[10px] uppercase">Contenido</Label>
            <textarea
              name="content"
              defaultValue={template.content}
              rows={4}
              required
              className="w-full rounded-md border border-outline-variant bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="font-mono text-[10px] uppercase">Segmento</Label>
            <select
              name="segment_id"
              defaultValue={template.segment_id ?? ""}
              className="h-9 w-full rounded-md border border-outline-variant bg-background px-3 text-sm"
            >
              <option value="">Sin segmento</option>
              {segments.map((segment) => (
                <option key={segment.id} value={segment.id}>
                  {segment.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={updatePending}
              className="h-8 bg-primary text-primary-foreground"
            >
              {updatePending ? "Guardando…" : "Guardar"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-8"
              onClick={() => setMode("view")}
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <div className="mb-4 flex-1 rounded-lg border border-outline-variant/40 bg-muted/40 p-3 text-sm text-secondary line-clamp-4">
          {template.content}
        </div>
      )}

      {mode === "view" ? (
        <form
          action={assignAction}
          className="mt-auto flex items-center gap-2 border-t border-outline-variant/40 pt-3"
        >
          <input type="hidden" name="id" value={template.id} />
          <select
            name="segment_id"
            defaultValue={template.segment_id ?? ""}
            className="h-8 flex-1 rounded-md border border-outline-variant bg-background px-2 text-xs"
          >
            <option value="">Sin segmento</option>
            {segments.map((segment) => (
              <option key={segment.id} value={segment.id}>
                {segment.name}
              </option>
            ))}
          </select>
          <Button
            type="submit"
            variant="outline"
            disabled={assignPending}
            className="h-8 text-xs"
          >
            Asignar
          </Button>
        </form>
      ) : null}

      {feedback ? (
        <p
          className={`mt-2 text-xs ${feedbackIsError ? "text-destructive" : "text-primary"}`}
          role={feedbackIsError ? "alert" : "status"}
        >
          {feedback}
        </p>
      ) : null}

      {template.variables.length > 0 && mode === "view" ? (
        <p className="mt-2 font-mono text-[10px] text-secondary">
          Vars: {template.variables.map((v) => `{{${v}}}`).join(" ")}
        </p>
      ) : null}
    </article>
  );
}
