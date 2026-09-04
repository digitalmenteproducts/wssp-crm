"use client";

import { useActionState, useState } from "react";

import {
  deleteKnowledgeAction,
  saveAiAgentSettingsAction,
  testAiAgentAction,
  upsertKnowledgeAction,
  type AiAgentFormState,
  type TestAgentState,
} from "@/app/(dashboard)/actions/ai-agent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AiAgentSettings, AiKnowledgeEntry } from "@/types/ai-agent";

const initialForm: AiAgentFormState = {};
const initialTest: TestAgentState = {};

const CATEGORY_LABEL: Record<string, string> = {
  faq: "Preguntas frecuentes",
  negocio: "Información del negocio",
  productos: "Productos",
  politicas: "Políticas",
  envios: "Envíos",
  pagos: "Pagos",
  otro: "Otro",
};

type AiAgentWorkspaceProps = {
  settings: AiAgentSettings;
  knowledge: AiKnowledgeEntry[];
  openAiConfigured: boolean;
  canEdit: boolean;
};

export function AiAgentWorkspace({
  settings,
  knowledge,
  openAiConfigured,
  canEdit,
}: AiAgentWorkspaceProps) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [tone, setTone] = useState(settings.tone);
  const [handoff, setHandoff] = useState(settings.human_handoff_enabled);
  const [query, setQuery] = useState("");
  const [saveState, saveAction, savePending] = useActionState(
    saveAiAgentSettingsAction,
    initialForm,
  );
  const [knowledgeState, knowledgeAction, knowledgePending] = useActionState(
    upsertKnowledgeAction,
    initialForm,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteKnowledgeAction,
    initialForm,
  );
  const [testState, testAction, testPending] = useActionState(
    testAiAgentAction,
    initialTest,
  );

  const statusLabel = !openAiConfigured
    ? "Error de configuración"
    : enabled
      ? "Activo"
      : "Pausado";

  const filtered = knowledge.filter((entry) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      entry.title.toLowerCase().includes(q) ||
      entry.content.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {!openAiConfigured ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Falta <code className="font-mono text-xs">OPENAI_API_KEY</code> en el
          servidor. El agente no podrá generar respuestas hasta configurarla en
          Vercel/env.
        </div>
      ) : null}

      <form
        action={saveAction}
        className="space-y-6 rounded-xl border border-outline-variant/50 bg-card p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Estado del agente</h2>
            <p className="text-sm text-secondary">
              Estado:{" "}
              <span className="font-medium text-on-surface">{statusLabel}</span>
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="enabled"
              value="true"
              checked={enabled}
              disabled={!canEdit}
              onChange={(event) => setEnabled(event.target.checked)}
              className="size-4"
            />
            Agente IA activo
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="font-mono text-xs uppercase">Nombre del agente</Label>
            <Input
              name="agent_name"
              required
              defaultValue={settings.agent_name}
              disabled={!canEdit}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-xs uppercase">Nombre del negocio</Label>
            <Input
              name="business_name"
              defaultValue={settings.business_name}
              disabled={!canEdit}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label className="font-mono text-xs uppercase">
              Descripción breve del negocio
            </Label>
            <textarea
              name="business_description"
              rows={2}
              defaultValue={settings.business_description}
              disabled={!canEdit}
              className="w-full rounded-md border border-outline-variant bg-card px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label className="font-mono text-xs uppercase">
              Instrucciones del agente
            </Label>
            <textarea
              name="system_instructions"
              rows={6}
              defaultValue={settings.system_instructions}
              disabled={!canEdit}
              placeholder="Eres el asistente comercial de [negocio]. Responde de manera amable, breve y profesional. No inventes información. Si no sabes, transfiere a un asesor."
              className="w-full rounded-md border border-outline-variant bg-card px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-xs uppercase">Tono</Label>
            <select
              name="tone"
              value={tone}
              disabled={!canEdit}
              onChange={(event) =>
                setTone(event.target.value as AiAgentSettings["tone"])
              }
              className="h-10 w-full rounded-md border border-outline-variant bg-card px-3 text-sm"
            >
              <option value="profesional">Profesional</option>
              <option value="amigable">Amigable</option>
              <option value="comercial">Comercial</option>
              <option value="directo">Directo</option>
              <option value="personalizado">Personalizado</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-xs uppercase">Idioma</Label>
            <select
              name="language"
              defaultValue={settings.language}
              disabled={!canEdit}
              className="h-10 w-full rounded-md border border-outline-variant bg-card px-3 text-sm"
            >
              <option value="auto">Automático</option>
              <option value="es">Español</option>
              <option value="en">Inglés</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-xs uppercase">
              Longitud de respuesta
            </Label>
            <select
              name="response_length"
              defaultValue={settings.response_length}
              disabled={!canEdit}
              className="h-10 w-full rounded-md border border-outline-variant bg-card px-3 text-sm"
            >
              <option value="breve">Breve</option>
              <option value="normal">Normal</option>
              <option value="detallada">Detallada</option>
            </select>
          </div>
          {tone === "personalizado" ? (
            <div className="space-y-1.5 md:col-span-2">
              <Label className="font-mono text-xs uppercase">
                Instrucciones de tono personalizado
              </Label>
              <Input
                name="custom_tone_instructions"
                defaultValue={settings.custom_tone_instructions}
                disabled={!canEdit}
                className="h-10"
              />
            </div>
          ) : (
            <input type="hidden" name="custom_tone_instructions" value="" />
          )}
        </div>

        <div className="space-y-3 rounded-lg border border-outline-variant/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-semibold">Transferencia a humano</h3>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="human_handoff_enabled"
                value="true"
                checked={handoff}
                disabled={!canEdit}
                onChange={(event) => setHandoff(event.target.checked)}
                className="size-4"
              />
              Permitir transferencia automática
            </label>
          </div>
          <p className="text-xs text-secondary">
            Se transfiere si el cliente pide una persona, falta conocimiento,
            hay un reclamo complejo, se marca manualmente, o se supera el
            máximo de intentos fallidos.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label className="font-mono text-xs uppercase">
                Instrucciones de transferencia
              </Label>
              <textarea
                name="human_handoff_instructions"
                rows={3}
                defaultValue={settings.human_handoff_instructions}
                disabled={!canEdit}
                className="w-full rounded-md border border-outline-variant bg-card px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-xs uppercase">
                Máx. intentos fallidos
              </Label>
              <Input
                name="max_failed_attempts"
                type="number"
                min={1}
                max={10}
                defaultValue={settings.max_failed_attempts}
                disabled={!canEdit}
                className="h-10"
              />
            </div>
          </div>
        </div>

        {saveState.error ? (
          <p className="text-sm text-destructive" role="alert">
            {saveState.error}
          </p>
        ) : null}
        {saveState.message ? (
          <p className="text-sm text-primary" role="status">
            {saveState.message}
          </p>
        ) : null}

        {canEdit ? (
          <Button
            type="submit"
            disabled={savePending}
            className="h-10 bg-primary text-primary-foreground"
          >
            {savePending ? "Guardando…" : "Guardar configuración"}
          </Button>
        ) : (
          <p className="text-xs text-secondary">
            Solo owner/admin pueden editar el Agente IA.
          </p>
        )}
      </form>

      <section className="space-y-4 rounded-xl border border-outline-variant/50 bg-card p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Base de conocimiento</h2>
            <p className="text-sm text-secondary">
              Entradas textuales por empresa. Sin embeddings en este MVP.
            </p>
          </div>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar…"
            className="h-9 max-w-xs"
          />
        </div>

        {canEdit ? (
          <form
            action={knowledgeAction}
            className="grid gap-3 rounded-lg border border-dashed border-outline-variant/60 p-4 md:grid-cols-2"
          >
            <div className="space-y-1.5 md:col-span-2">
              <Label className="font-mono text-xs uppercase">Título</Label>
              <Input name="title" required className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-xs uppercase">Categoría</Label>
              <select
                name="category"
                defaultValue="faq"
                className="h-10 w-full rounded-md border border-outline-variant bg-card px-3 text-sm"
              >
                {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                name="enabled"
                value="true"
                defaultChecked
                className="size-4"
              />
              Activa
            </label>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="font-mono text-xs uppercase">Contenido</Label>
              <textarea
                name="content"
                required
                rows={4}
                className="w-full rounded-md border border-outline-variant bg-card px-3 py-2 text-sm"
              />
            </div>
            <Button
              type="submit"
              disabled={knowledgePending}
              className="h-9 bg-primary text-primary-foreground"
            >
              {knowledgePending ? "Guardando…" : "Añadir entrada"}
            </Button>
            {knowledgeState.error ? (
              <p className="text-sm text-destructive md:col-span-2">
                {knowledgeState.error}
              </p>
            ) : null}
            {knowledgeState.message ? (
              <p className="text-sm text-primary md:col-span-2">
                {knowledgeState.message}
              </p>
            ) : null}
          </form>
        ) : null}

        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-outline-variant p-8 text-center text-sm text-secondary">
            No hay entradas de conocimiento todavía.
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((entry) => (
              <li
                key={entry.id}
                className="rounded-lg border border-outline-variant/40 p-4"
              >
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{entry.title}</p>
                  <span className="font-mono text-[10px] tracking-wider text-secondary uppercase">
                    {CATEGORY_LABEL[entry.category] ?? entry.category}
                    {entry.enabled ? "" : " · inactiva"}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-secondary">
                  {entry.content}
                </p>
                {canEdit ? (
                  <form action={deleteAction} className="mt-3">
                    <input type="hidden" name="id" value={entry.id} />
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={deletePending}
                      className="h-8 text-xs text-destructive"
                    >
                      Eliminar
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {deleteState.error ? (
          <p className="text-sm text-destructive">{deleteState.error}</p>
        ) : null}
        {deleteState.message ? (
          <p className="text-sm text-primary">{deleteState.message}</p>
        ) : null}
      </section>

      <section className="space-y-4 rounded-xl border border-outline-variant/50 bg-card p-6">
        <div>
          <h2 className="text-lg font-semibold">Probar agente</h2>
          <p className="text-sm text-secondary">
            Usa la configuración y el conocimiento reales. No envía nada a
            WhatsApp.
          </p>
        </div>
        <form action={testAction} className="space-y-3">
          <textarea
            name="message"
            required
            rows={3}
            placeholder="¿A qué hora cierran?"
            className="w-full rounded-md border border-outline-variant bg-card px-3 py-2 text-sm"
          />
          <Button
            type="submit"
            disabled={testPending || !canEdit}
            className="h-9 bg-primary text-primary-foreground"
          >
            {testPending ? "Generando…" : "Probar respuesta"}
          </Button>
        </form>
        {testState.error ? (
          <p className="text-sm text-destructive" role="alert">
            {testState.error}
          </p>
        ) : null}
        {testState.reply ? (
          <div className="space-y-2 rounded-lg bg-muted/40 p-4 text-sm">
            <p className="whitespace-pre-wrap text-on-surface">
              {testState.reply}
            </p>
            <p className="font-mono text-[11px] text-secondary">
              confidence={testState.confidence} · handoff=
              {testState.should_handoff ? "sí" : "no"}
              {testState.handoff_reason
                ? ` · ${testState.handoff_reason}`
                : ""}
              {testState.model ? ` · model=${testState.model}` : ""}
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
