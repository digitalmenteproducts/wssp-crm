import type { Metadata } from "next";

import { BrandLogo } from "@/components/layout/brand-logo";
import { RegisterForm } from "@/components/layout/register-form";
import { APP_NAME } from "@/config/app";

export const metadata: Metadata = {
  title: "Solicitar acceso",
};

export default function RegistroPage() {
  return (
    <div className="flex w-full max-w-[400px] flex-col gap-12">
      <div className="flex flex-col items-center justify-center gap-2 text-center">
        <BrandLogo size={64} priority className="mb-2" />
        <h1 className="font-heading text-[32px] leading-10 font-semibold tracking-tight text-on-surface">
          Solicitar acceso
        </h1>
        <p className="text-sm text-secondary">
          Crea tu cuenta para empezar a usar {APP_NAME}.
        </p>
      </div>

      <div className="rounded-lg border border-outline-variant bg-card p-6 shadow-sm">
        <RegisterForm />
      </div>

      <p className="text-center font-mono text-xs tracking-wide text-outline">
        © {new Date().getFullYear()} {APP_NAME}. Todos los derechos reservados.
      </p>
    </div>
  );
}
