"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";

import {
  syncTemplatesAction,
  type TemplateFormState,
} from "@/app/(dashboard)/actions/sprint5";
import { Button } from "@/components/ui/button";

const initialState: TemplateFormState = {};

export function SyncTemplatesButton() {
  const [state, formAction, pending] = useActionState(
    syncTemplatesAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        className="h-9 gap-2"
      >
        <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} />
        {pending ? "Sincronizando…" : "Sincronizar Meta"}
      </Button>
      {state.error ? (
        <p className="max-w-xs text-right text-xs text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p className="max-w-xs text-right text-xs text-primary" role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
