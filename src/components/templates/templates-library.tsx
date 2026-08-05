"use client";

import { useMemo, useState } from "react";

import { TemplateCard } from "@/components/templates/template-card";
import type { Template } from "@/types/templates";

type TemplatesLibraryProps = {
  templates: Template[];
  segments: Array<{ id: string; name: string }>;
};

export function TemplatesLibrary({
  templates,
  segments,
}: TemplatesLibraryProps) {
  const categories = useMemo(() => {
    const set = new Set(templates.map((item) => item.category));
    return Array.from(set).sort();
  }, [templates]);

  const [filter, setFilter] = useState<string>("all");

  const visible = templates.filter(
    (item) => filter === "all" || item.category === filter,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded-md px-3 py-1.5 font-mono text-xs tracking-wide uppercase transition-colors ${
            filter === "all"
              ? "bg-secondary-container text-on-surface"
              : "border border-outline-variant bg-card text-secondary hover:bg-muted"
          }`}
        >
          Todas
        </button>
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setFilter(category)}
            className={`rounded-md px-3 py-1.5 font-mono text-xs tracking-wide uppercase transition-colors ${
              filter === category
                ? "bg-secondary-container text-on-surface"
                : "border border-outline-variant bg-card text-secondary hover:bg-muted"
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-outline-variant bg-card p-10 text-center text-sm text-secondary">
          No hay plantillas en este filtro. Crea una o sincroniza desde Meta.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              segments={segments}
            />
          ))}
        </div>
      )}
    </div>
  );
}
