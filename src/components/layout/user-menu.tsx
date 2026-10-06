"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { KeyRound, LogOut, X } from "lucide-react";

import {
  changePasswordAction,
  logoutAction,
  type AuthFormState,
} from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type UserMenuProps = {
  userEmail?: string | null;
  initials: string;
};

export function UserMenu({ userEmail, initials }: UserMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title={userEmail ?? "Cuenta"}
        className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        aria-label="Menú de usuario"
      >
        {initials}
      </button>

      {menuOpen ? (
        <div
          role="menu"
          className="absolute top-10 right-0 z-50 w-56 rounded-lg border border-outline-variant/50 bg-card p-1 shadow-lg"
        >
          {userEmail ? (
            <p className="truncate px-3 py-2 text-xs text-secondary">{userEmail}</p>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              setPasswordOpen(true);
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-on-surface hover:bg-muted"
          >
            <KeyRound className="size-4" />
            Cambiar contraseña
          </button>
          <form action={logoutAction}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-on-surface hover:bg-muted"
            >
              <LogOut className="size-4" />
              Cerrar sesión
            </button>
          </form>
        </div>
      ) : null}

      {passwordOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-password-title"
            className="w-full max-w-sm rounded-xl border border-outline-variant/50 bg-card p-6 shadow-lg"
          >
            <ChangePasswordForm
              key={formKey}
              onClose={() => {
                setPasswordOpen(false);
                setFormKey((k) => k + 1);
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

const initialState: AuthFormState = {};

function ChangePasswordForm({ onClose }: { onClose: () => void }) {
  const [state, formAction, pending] = useActionState(changePasswordAction, initialState);

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-4">
        <h2 id="change-password-title" className="text-lg font-semibold text-on-surface">
          Cambiar contraseña
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-outline transition-colors hover:text-foreground"
          aria-label="Cerrar"
        >
          <X className="size-4" />
        </button>
      </div>

      {state.message ? (
        <div className="flex flex-col gap-4">
          <p role="status" className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
            {state.message}
          </p>
          <div className="flex justify-end">
            <Button type="button" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      ) : (
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="new-password">Nueva contraseña</Label>
            <Input
              id="new-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={72}
            />
            <p className="text-xs text-secondary">Mínimo 8 caracteres, con letras y números.</p>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="confirm-password">Confirmar nueva contraseña</Label>
            <Input
              id="confirm-password"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={72}
            />
          </div>
          {state.error ? (
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
              {pending ? "Guardando…" : "Guardar contraseña"}
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
