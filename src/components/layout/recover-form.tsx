"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";

import {
  recoverAction,
  type AuthFormState,
} from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROUTES } from "@/config/app";

const initialState: AuthFormState = {};

export function RecoverForm() {
  const [state, formAction, pending] = useActionState(
    recoverAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Label
          htmlFor="email"
          className="font-mono text-xs font-medium tracking-wider text-on-surface-variant uppercase"
        >
          Correo electrónico
        </Label>
        <div className="relative">
          <Mail
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-outline"
          />
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
            className="h-10 rounded-md border-outline-variant bg-card pr-3 pl-10 text-sm placeholder:text-outline-variant focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      {state.message ? (
        <p
          role="status"
          className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary"
        >
          {state.message}
        </p>
      ) : null}

      <div className="pt-2">
        <Button
          type="submit"
          disabled={pending}
          className="h-11 w-full rounded-md border-t border-white/20 bg-primary text-base font-semibold text-primary-foreground shadow-sm hover:bg-primary-container"
        >
          {pending ? "Enviando…" : "Enviar instrucciones"}
          <ArrowRight className="size-4" />
        </Button>
      </div>

      <p className="text-center text-sm text-secondary">
        <Link
          href={ROUTES.login}
          className="font-medium text-primary hover:underline"
        >
          Volver al inicio de sesión
        </Link>
      </p>
    </form>
  );
}
