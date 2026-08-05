"use client";

import { useActionState } from "react";

import {
  runClassificationAction,
  type ClassifyFormState,
} from "@/app/(dashboard)/actions/sprint3";
import { Button } from "@/components/ui/button";

const initialState: ClassifyFormState = {};

export function RunClassificationButton() {
  const [state, formAction, pending] = useActionState(
    runClassificationAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <Button
        type="submit"
        disabled={pending}
        className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary-container"
      >
        {pending ? "Clasificando…" : "Clasificar ahora (IA)"}
      </Button>
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
    </form>
  );
}
