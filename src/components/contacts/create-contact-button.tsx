"use client";

import { Plus } from "lucide-react";
import { useActionState, useState, startTransition } from "react";

import {
  createManualContactAction,
  type BoardActionState,
} from "@/app/(dashboard)/actions/sprint4";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: BoardActionState = {};

type CreateContactButtonProps = {
  singularLabel: string;
  newLabel: string;
};

export function CreateContactButton({
  singularLabel,
  newLabel,
}: CreateContactButtonProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: BoardActionState, formData: FormData) => {
      const result = await createManualContactAction(prev, formData);
      if (result.message) {
        startTransition(() => setOpen(false));
      }
      return result;
    },
    initialState,
  );

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-9 gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary-container"
      >
        <Plus className="size-4" />
        {newLabel}
      </Button>

      {state.message && !open ? (
        <p className="text-sm text-primary" role="status">
          {state.message}
        </p>
      ) : null}

      {open ? (
        <form
          action={formAction}
          className="w-full max-w-sm space-y-3 rounded-xl border border-outline-variant/50 bg-card p-4 shadow-sm"
        >
          <p className="text-sm font-semibold text-on-surface">{newLabel}</p>
          <div className="space-y-1">
            <Label htmlFor="manual_contact_name">Nombre *</Label>
            <Input
              id="manual_contact_name"
              name="name"
              required
              maxLength={120}
              placeholder={`Nombre del ${singularLabel.toLowerCase()}`}
              autoComplete="name"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="manual_contact_phone">Teléfono / WhatsApp *</Label>
            <Input
              id="manual_contact_phone"
              name="phone"
              required
              inputMode="tel"
              placeholder="+54 9 381 ..."
              autoComplete="tel"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="manual_contact_email">Email (opcional)</Label>
            <Input
              id="manual_contact_email"
              name="email"
              type="email"
              maxLength={320}
              placeholder="opcional@email.com"
              autoComplete="email"
            />
          </div>
          {state.error ? (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={pending} className="h-9">
              {pending ? "Guardando…" : "Guardar"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
