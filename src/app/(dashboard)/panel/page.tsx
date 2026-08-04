import type { Metadata } from "next";

import { logoutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/config/app";
import { getCurrentUser } from "@/repositories/auth.repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Panel de control",
};

export default async function PanelPage() {
  const { data } = await getCurrentUser();
  const email = data.user?.email ?? "usuario";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs tracking-wider text-outline uppercase">
          Sprint 1
        </p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Panel de control
        </h1>
        <p className="text-secondary">
          Sesión iniciada en {APP_NAME} como{" "}
          <span className="font-medium text-foreground">{email}</span>.
        </p>
        <p className="text-sm text-muted-foreground">
          El shell visual del dashboard (sidebar + métricas) llega en el
          siguiente paso del Sprint 1.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <form action={logoutAction}>
          <Button type="submit" variant="outline">
            Cerrar sesión
          </Button>
        </form>
      </div>
    </main>
  );
}
