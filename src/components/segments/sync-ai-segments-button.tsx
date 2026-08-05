"use client";

import { useActionState } from "react";
import { Sparkles } from "lucide-react";

import {
  syncAiSegmentsAction,
  type SegmentFormState,
} from "@/app/(dashboard)/actions/sprint3";
import { Button } from "@/components/ui/button";

const initialState: SegmentFormState = {};

export function SyncAiSegmentsButton() {
  const [state, formAction, pending] = useActionState(
    syncAiSegmentsAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <Button type="submit" variant="outline" disabled={pending} className="h-9 gap-2">
        <Sparkles className={`size-4 ${pending ? "animate-pulse" : ""}`} />
        {pending ? "Actualizando…" : "Actualizar segmentos IA"}
      </Button>
      {state.error ? (
        <p className="max-w-xs text-right text-xs text-destructive">{state.error}</p>
      ) : null}
      {state.message ? (
        <p className="max-w-xs text-right text-xs text-primary">{state.message}</p>
      ) : null}
    </form>
  );
}
