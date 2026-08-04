"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";

import {
  loginAction,
  type AuthFormState,
} from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROUTES } from "@/config/app";

const initialState: AuthFormState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

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

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <Label
            htmlFor="password"
            className="font-mono text-xs font-medium tracking-wider text-on-surface-variant uppercase"
          >
            Contraseña
          </Label>
          <Link
            href={ROUTES.recuperar}
            className="text-sm text-primary transition-colors hover:text-primary-container"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
        <div className="relative">
          <Lock
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-outline"
          />
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            placeholder="••••••••"
            className="h-10 rounded-md border-outline-variant bg-card pr-10 pl-10 text-sm placeholder:text-outline-variant focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-primary"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-outline transition-colors hover:text-foreground"
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            {showPassword ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
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

      <div className="pt-2">
        <Button
          type="submit"
          disabled={pending}
          className="h-11 w-full rounded-md border-t border-white/20 bg-primary text-base font-semibold text-primary-foreground shadow-sm hover:bg-primary-container"
        >
          {pending ? "Entrando…" : "Iniciar sesión"}
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </form>
  );
}
