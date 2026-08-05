"use client";

import Link from "next/link";

import { ROUTES } from "@/config/app";
import type { Segment, SegmentOrigin } from "@/types/ai";

const ORIGIN_LABEL: Record<SegmentOrigin, string> = {
  ai: "Creado por IA",
  system: "Predefinido",
  manual: "Manual",
};

const ORIGIN_CLASS: Record<SegmentOrigin, string> = {
  ai: "bg-sky-100 text-sky-800",
  system: "bg-slate-100 text-slate-700",
  manual: "bg-amber-100 text-amber-900",
};

type SegmentCardProps = {
  segment: Segment;
  count: number;
  rulesSummary: string;
  error?: string | null;
};

export function SegmentCard({
  segment,
  count,
  rulesSummary,
  error,
}: SegmentCardProps) {
  const origin = segment.origin ?? "manual";
  const updated = new Date(segment.updated_at).toLocaleString("es", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <article className="flex flex-col rounded-xl border border-outline-variant/50 bg-card p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <span
          className={`rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${ORIGIN_CLASS[origin]}`}
        >
          {ORIGIN_LABEL[origin]}
        </span>
        <span className="text-[11px] text-secondary">{updated}</span>
      </div>

      <h3 className="text-lg font-semibold leading-snug">{segment.name}</h3>
      <p className="mt-1 text-sm text-secondary">
        {segment.description ?? "Sin descripción"}
      </p>

      <p className="mt-4 font-heading text-3xl font-semibold">{count}</p>
      <p className="text-xs text-secondary">contactos actuales</p>

      <p className="mt-3 rounded-md bg-muted/60 px-2.5 py-2 text-xs text-secondary">
        {rulesSummary}
      </p>

      {error ? (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      ) : null}

      <div className="mt-auto pt-4">
        <Link
          href={`${ROUTES.campanasNueva}?segmento=${segment.id}`}
          className="inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary-container"
        >
          Crear campaña
        </Link>
      </div>
    </article>
  );
}
