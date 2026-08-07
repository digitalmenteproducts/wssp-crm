"use client";

import { useActionState, useMemo, useRef, useState } from "react";

import {
  createTemplateAction,
  updateTemplateAction,
  type TemplateFormState,
} from "@/app/(dashboard)/actions/sprint5";
import { TemplateVariablesHint } from "@/components/templates/template-variables-hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCrmVariableMeta } from "@/lib/templates/crm-variables";
import { previewTemplateContent } from "@/lib/templates/preview";
import { slugifyTemplateName } from "@/lib/templates/slug";
import type { Template, TemplateButton } from "@/types/templates";

const initialState: TemplateFormState = {};

type CreateTemplateFormProps = {
  segments: Array<{ id: string; name: string }>;
  template?: Template;
  onCancel?: () => void;
};

export function CreateTemplateForm({
  segments,
  template,
  onCancel,
}: CreateTemplateFormProps) {
  const isEdit = Boolean(template);
  const [open, setOpen] = useState(isEdit);
  const [displayName, setDisplayName] = useState(
    template?.display_name ?? "",
  );
  const [name, setName] = useState(template?.name ?? "");
  const [header, setHeader] = useState(template?.header_text ?? "");
  const [content, setContent] = useState(template?.content ?? "");
  const [footer, setFooter] = useState(template?.footer_text ?? "");
  const [examples, setExamples] = useState<Record<string, string>>(
    template?.variable_examples ?? {},
  );
  const [buttons, setButtons] = useState<TemplateButton[]>(
    template?.buttons ?? [],
  );
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [state, formAction, pending] = useActionState(
    isEdit ? updateTemplateAction : createTemplateAction,
    initialState,
  );

  const variables = useMemo(() => {
    const matches = Array.from(content.matchAll(/\{\{\s*(\d+)\s*\}\}/g)).map(
      (match) => match[1],
    );
    return Array.from(new Set(matches)).sort((a, b) => Number(a) - Number(b));
  }, [content]);

  const preview = useMemo(
    () => previewTemplateContent(content, examples),
    [content, examples],
  );

  function insertVariable(token: string) {
    const textarea = contentRef.current;
    if (!textarea) {
      setContent((prev) => `${prev}${token}`);
      return;
    }

    const start = textarea.selectionStart ?? content.length;
    const end = textarea.selectionEnd ?? content.length;
    const next = `${content.slice(0, start)}${token}${content.slice(end)}`;
    setContent(next);

    requestAnimationFrame(() => {
      textarea.focus();
      const caret = start + token.length;
      textarea.setSelectionRange(caret, caret);
    });
  }

  function handleClose() {
    if (onCancel) {
      onCancel();
      return;
    }
    setOpen(false);
  }

  if (!open) {
    return (
      <Button
        type="button"
        className="h-9 bg-primary text-primary-foreground"
        onClick={() => setOpen(true)}
      >
        Nueva plantilla
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-xl border border-outline-variant/50 bg-card p-5"
    >
      {isEdit ? <input type="hidden" name="id" value={template!.id} /> : null}

      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">
            {isEdit ? "Editar plantilla" : "Nueva plantilla"}
          </h3>
          <p className="text-xs text-secondary">
            {isEdit
              ? "Guarda los cambios y luego envíala a Meta para revisión."
              : "Se guarda como borrador. Luego puedes enviarla a Meta para revisión."}
          </p>
        </div>
        <button
          type="button"
          className="text-xs text-secondary hover:text-primary"
          onClick={handleClose}
        >
          Cerrar
        </button>
      </div>

      <input type="hidden" name="buttons_json" value={JSON.stringify(buttons)} />
      <input
        type="hidden"
        name="variable_examples_json"
        value={JSON.stringify(examples)}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="font-mono text-xs uppercase">Nombre amigable</Label>
          <Input
            name="display_name"
            required
            value={displayName}
            onChange={(event) => {
              const value = event.target.value;
              setDisplayName(value);
              if (!isEdit || !template?.name) {
                setName(slugifyTemplateName(value));
              }
            }}
            placeholder="Promoción Pizza Viernes"
            className="h-10"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="font-mono text-xs uppercase">Nombre técnico</Label>
          <Input
            name="name"
            required
            value={name}
            onChange={(event) =>
              setName(slugifyTemplateName(event.target.value))
            }
            className="h-10 font-mono text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="font-mono text-xs uppercase">Categoría</Label>
          <select
            name="category"
            defaultValue={template?.category ?? "MARKETING"}
            className="h-10 w-full rounded-md border border-outline-variant bg-card px-3 text-sm"
          >
            <option value="MARKETING">Marketing</option>
            <option value="UTILITY">Utilidad</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="font-mono text-xs uppercase">Idioma</Label>
          <select
            name="language"
            defaultValue={template?.language ?? "es"}
            className="h-10 w-full rounded-md border border-outline-variant bg-card px-3 text-sm"
          >
            <option value="es">Español (es)</option>
            <option value="en_US">English (en_US)</option>
          </select>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label className="font-mono text-xs uppercase">
            Encabezado (opcional)
          </Label>
          <Input
            name="header_text"
            value={header}
            onChange={(event) => setHeader(event.target.value)}
            maxLength={60}
            className="h-10"
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label className="font-mono text-xs uppercase">Cuerpo</Label>
          <TemplateVariablesHint onInsert={insertVariable} />
          <textarea
            ref={contentRef}
            name="content"
            required
            rows={4}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Hola {{1}}, hoy tenemos {{3}} de descuento en {{2}}."
            className="mt-2 w-full rounded-md border border-outline-variant bg-card px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label className="font-mono text-xs uppercase">Pie (opcional)</Label>
          <Input
            name="footer_text"
            value={footer}
            onChange={(event) => setFooter(event.target.value)}
            maxLength={60}
            className="h-10"
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label className="font-mono text-xs uppercase">
            Segmento (opcional)
          </Label>
          <select
            name="segment_id"
            defaultValue={template?.segment_id ?? ""}
            className="h-10 w-full rounded-md border border-outline-variant bg-card px-3 text-sm"
          >
            <option value="">Sin segmento</option>
            {segments.map((segment) => (
              <option key={segment.id} value={segment.id}>
                {segment.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {variables.length > 0 ? (
        <div className="space-y-2 rounded-lg border border-outline-variant/40 p-3">
          <p className="font-mono text-xs tracking-wider text-secondary uppercase">
            Ejemplos de variables (requeridos por Meta)
          </p>
          <div className="grid gap-2 md:grid-cols-3">
            {variables.map((variable) => {
              const meta = getCrmVariableMeta(variable);
              return (
                <div key={variable} className="space-y-1">
                  <Label className="font-mono text-[10px] uppercase">
                    {`{{${variable}}}`}
                    {meta ? ` · ${meta.label}` : ""}
                  </Label>
                  <Input
                    value={examples[variable] ?? ""}
                    onChange={(event) =>
                      setExamples({
                        ...examples,
                        [variable]: event.target.value,
                      })
                    }
                    placeholder={meta?.example ?? "Ejemplo"}
                    className="h-9"
                    required
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="space-y-2 rounded-lg border border-outline-variant/40 p-3">
        <div className="flex items-center justify-between">
          <p className="font-mono text-xs tracking-wider text-secondary uppercase">
            Botones (opcional, máx. 3)
          </p>
          {buttons.length < 3 ? (
            <Button
              type="button"
              variant="outline"
              className="h-7 text-xs"
              onClick={() =>
                setButtons([
                  ...buttons,
                  { type: "QUICK_REPLY", text: "Sí, me interesa" },
                ])
              }
            >
              Añadir botón
            </Button>
          ) : null}
        </div>
        {buttons.map((button, index) => (
          <div
            key={index}
            className="grid gap-2 rounded-md border border-outline-variant/30 p-2 md:grid-cols-4"
          >
            <select
              className="h-9 rounded-md border border-outline-variant bg-background px-2 text-xs"
              value={button.type}
              onChange={(event) => {
                const next = [...buttons];
                next[index] = {
                  ...next[index],
                  type: event.target.value as TemplateButton["type"],
                };
                setButtons(next);
              }}
            >
              <option value="QUICK_REPLY">Respuesta rápida</option>
              <option value="URL">URL</option>
              <option value="PHONE_NUMBER">Teléfono</option>
            </select>
            <Input
              value={button.text}
              onChange={(event) => {
                const next = [...buttons];
                next[index] = { ...next[index], text: event.target.value };
                setButtons(next);
              }}
              placeholder="Texto"
              className="h-9"
            />
            {button.type === "URL" ? (
              <Input
                value={button.url ?? ""}
                onChange={(event) => {
                  const next = [...buttons];
                  next[index] = { ...next[index], url: event.target.value };
                  setButtons(next);
                }}
                placeholder="https://"
                className="h-9 md:col-span-1"
              />
            ) : null}
            {button.type === "PHONE_NUMBER" ? (
              <Input
                value={button.phone_number ?? ""}
                onChange={(event) => {
                  const next = [...buttons];
                  next[index] = {
                    ...next[index],
                    phone_number: event.target.value,
                  };
                  setButtons(next);
                }}
                placeholder="58424..."
                className="h-9"
              />
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="h-9 text-xs"
              onClick={() => setButtons(buttons.filter((_, i) => i !== index))}
            >
              Quitar
            </Button>
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-muted/40 p-3 text-sm text-secondary">
        <p className="mb-1 font-mono text-[10px] tracking-wider uppercase">
          Vista previa
        </p>
        {header ? <p className="font-semibold text-on-surface">{header}</p> : null}
        <p className="whitespace-pre-wrap text-on-surface">{preview || "—"}</p>
        {footer ? <p className="mt-1 text-xs">{footer}</p> : null}
      </div>

      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p className="text-sm text-primary" role="status">
          {state.message}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={pending}
        className="h-9 bg-primary text-primary-foreground hover:bg-primary-container"
      >
        {pending
          ? "Guardando…"
          : isEdit
            ? "Guardar cambios"
            : "Guardar borrador"}
      </Button>
    </form>
  );
}
