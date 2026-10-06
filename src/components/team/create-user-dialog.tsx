"use client";

import { useActionState, useEffect, useState } from "react";
import { Copy, UserPlus, X } from "lucide-react";

import {
  createBusinessUserAction,
  type CreateUserFormState,
} from "@/app/(dashboard)/configuracion/equipo/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { businessRoleLabel, CREATABLE_ROLES, formatCredentialsForCopy } from "@/lib/team";

const initialState: CreateUserFormState = { ok: null };

export function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus />
        Crear usuario
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-user-title"
            className="w-full max-w-md rounded-xl border border-outline-variant/50 bg-card p-6 shadow-lg"
          >
            <CreateUserForm
              key={formKey}
              onClose={() => {
                setOpen(false);
                // Al cerrar se descarta el estado (y la contraseña mostrada).
                setFormKey((k) => k + 1);
              }}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

function CopyCredentialsButton({ text }: { text: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          navigator.clipboard.writeText(text).then(
            () => setStatus("copied"),
            () => setStatus("error"),
          );
        }}
      >
        <Copy />
        Copiar credenciales
      </Button>
      {status === "copied" ? <span className="text-xs text-green-800">Copiado</span> : null}
      {status === "error" ? (
        <span className="text-xs text-destructive">No se pudo copiar; cópialas manualmente.</span>
      ) : null}
    </div>
  );
}

function CreateUserForm({ onClose }: { onClose: () => void }) {
  const [state, formAction, pending] = useActionState(createBusinessUserAction, initialState);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 id="create-user-title" className="text-lg font-semibold text-on-surface">
            Crear usuario
          </h2>
          <p className="text-sm text-on-surface-variant">
            Tendrá acceso a este negocio con el rol seleccionado.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-outline transition-colors hover:text-foreground"
          aria-label="Cerrar"
        >
          <X className="size-4" />
        </button>
      </div>

      {state.ok === true ? (
        <div className="flex flex-col gap-4">
          <p role="status" className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
            {state.message}
          </p>
          {!state.emailSent ? (
            <div className="flex flex-col gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">
                Guarda esta contraseña ahora. Por seguridad no volverá a mostrarse.
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-amber-800">URL de acceso</dt>
                <dd className="font-mono break-all">{state.loginUrl}</dd>
                <dt className="text-amber-800">Email</dt>
                <dd className="font-mono break-all">{state.email}</dd>
                <dt className="text-amber-800">Contraseña temporal</dt>
                <dd className="font-mono break-all select-all">{state.temporaryPassword}</dd>
              </dl>
              <CopyCredentialsButton
                text={formatCredentialsForCopy({
                  loginUrl: state.loginUrl,
                  email: state.email,
                  temporaryPassword: state.temporaryPassword,
                })}
              />
            </div>
          ) : null}
          <div className="flex justify-end">
            <Button type="button" onClick={onClose}>
              Listo
            </Button>
          </div>
        </div>
      ) : (
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="create-user-name">Nombre</Label>
            <Input id="create-user-name" name="name" required minLength={2} maxLength={120} autoComplete="off" />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="create-user-email">Email</Label>
            <Input
              id="create-user-email"
              name="email"
              type="email"
              required
              autoComplete="off"
              placeholder="persona@ejemplo.com"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="create-user-role">Rol</Label>
            <select
              id="create-user-role"
              name="role"
              required
              defaultValue="professional"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            >
              {CREATABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {businessRoleLabel(role)}
                </option>
              ))}
            </select>
          </div>

          {state.ok === false ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {state.error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creando…" : "Crear usuario"}
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
