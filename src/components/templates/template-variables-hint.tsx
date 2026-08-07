"use client";

import { CRM_TEMPLATE_VARIABLES } from "@/lib/templates/crm-variables";

type TemplateVariablesHintProps = {
  onInsert?: (token: string) => void;
};

export function TemplateVariablesHint({
  onInsert,
}: TemplateVariablesHintProps) {
  return (
    <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-3">
      <div>
        <p className="text-sm font-semibold text-on-surface">
          Insertar variable
        </p>
        <p className="mt-0.5 text-xs text-secondary">
          Meta exige {"{{1}}"}, {"{{2}}"}, {"{{3}}"}… WhatsCRM las rellena al
          enviar la campaña. Haz clic para insertarlas en el mensaje:
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {CRM_TEMPLATE_VARIABLES.map((variable) => (
          <button
            key={variable.key}
            type="button"
            title={`${variable.description}. Ejemplo: ${variable.example}`}
            onClick={() => onInsert?.(variable.token)}
            className="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-card px-3 py-2 text-left shadow-sm transition-colors hover:border-primary hover:bg-primary/10"
          >
            <code className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-sm font-semibold text-primary">
              {variable.token}
            </code>
            <span className="text-sm text-on-surface">
              {variable.label}
              <span className="mt-0.5 block text-[11px] text-secondary">
                {variable.description}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
