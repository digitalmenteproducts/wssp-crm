"use client";

import { useMemo, useState } from "react";

import { SegmentCard } from "@/components/segments/segment-card";
import type { Segment, SegmentOrigin } from "@/types/ai";

type Card = {
  segment: Segment;
  count: number;
  rulesSummary: string;
  error: string | null;
};

type FilterId = "all" | SegmentOrigin;

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "ai", label: "Creados por IA" },
  { id: "system", label: "Predefinidos" },
  { id: "manual", label: "Manuales" },
];

type SegmentsLibraryProps = {
  cards: Card[];
};

export function SegmentsLibrary({ cards }: SegmentsLibraryProps) {
  const [filter, setFilter] = useState<FilterId>("all");

  const visible = useMemo(() => {
    if (filter === "all") return cards;
    return cards.filter((card) => (card.segment.origin ?? "manual") === filter);
  }, [cards, filter]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`rounded-md px-3 py-1.5 font-mono text-xs tracking-wide uppercase transition-colors ${
              filter === item.id
                ? "bg-secondary-container text-on-surface"
                : "border border-outline-variant bg-card text-secondary hover:bg-muted"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-outline-variant bg-card p-10 text-center text-sm text-secondary">
          No hay segmentos en este filtro.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((card) => (
            <SegmentCard
              key={card.segment.id}
              segment={card.segment}
              count={card.count}
              rulesSummary={card.rulesSummary}
              error={card.error}
            />
          ))}
        </div>
      )}
    </div>
  );
}
