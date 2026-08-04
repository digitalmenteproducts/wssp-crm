import { Bell, Search } from "lucide-react";

import { logoutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { APP_NAME } from "@/config/app";

type AppHeaderProps = {
  userEmail?: string | null;
};

function initialsFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "U";
  return local.slice(0, 2).toUpperCase();
}

export function AppHeader({ userEmail }: AppHeaderProps) {
  const initials = userEmail ? initialsFromEmail(userEmail) : "U";

  return (
    <header className="fixed top-0 right-0 z-40 flex h-16 w-[calc(100%-260px)] items-center justify-between border-b border-outline-variant/40 bg-surface px-6">
      <div className="relative w-64 max-w-full">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-secondary" />
        <Input
          type="search"
          placeholder={`Buscar en ${APP_NAME}...`}
          disabled
          className="h-9 rounded-md border-outline-variant bg-card pr-3 pl-9 text-[13px] placeholder:text-outline"
          aria-label="Buscar"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled
          title="Fuera del alcance del MVP actual"
          className="hidden h-8 rounded-md border-outline-variant bg-card text-[13px] font-medium sm:inline-flex"
        >
          Invitar Usuario
        </Button>

        <div className="mx-1 hidden h-6 w-px bg-outline-variant/50 sm:block" />

        <button
          type="button"
          disabled
          className="rounded-full p-1.5 text-secondary transition-colors hover:bg-muted hover:text-primary disabled:opacity-50"
          aria-label="Notificaciones"
        >
          <Bell className="size-5" />
        </button>

        <form action={logoutAction}>
          <button
            type="submit"
            title={userEmail ? `Cerrar sesión (${userEmail})` : "Cerrar sesión"}
            className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            aria-label="Cerrar sesión"
          >
            {initials}
          </button>
        </form>
      </div>
    </header>
  );
}
