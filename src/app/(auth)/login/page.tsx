import type { Metadata } from "next";
import Link from "next/link";

import { BrandLogo } from "@/components/layout/brand-logo";
import { LoginForm } from "@/components/layout/login-form";
import { APP_NAME, APP_TAGLINE, ROUTES } from "@/config/app";

export const metadata: Metadata = {
  title: "Iniciar sesión",
};

export default function LoginPage() {
  return (
    <div className="flex w-full max-w-[400px] flex-col gap-12">
      <div className="flex flex-col items-center justify-center gap-2 text-center">
        <BrandLogo size={64} priority className="mb-2" />
        <h1 className="font-heading text-[32px] leading-10 font-semibold tracking-tight text-on-surface">
          Iniciar sesión en {APP_NAME}
        </h1>
        <p className="text-sm text-secondary">{APP_TAGLINE}</p>
      </div>

      <div className="rounded-lg border border-outline-variant bg-card p-6 shadow-sm">
        <LoginForm />

        <div className="mt-6 flex flex-col gap-4 border-t border-outline-variant/30 pt-4 text-center">
          <p className="text-sm text-secondary">
            ¿No tienes una cuenta?{" "}
            <Link
              href={ROUTES.registro}
              className="font-medium text-primary hover:underline"
            >
              Solicitar acceso
            </Link>
          </p>
        </div>
      </div>

      <p className="text-center font-mono text-xs tracking-wide text-outline">
        © {new Date().getFullYear()} {APP_NAME}. Todos los derechos reservados.
      </p>
    </div>
  );
}
