import Link from "next/link";

import { ROUTES } from "@/config/app";
import { cn } from "@/lib/utils";

type SettingsSection = "general" | "integraciones" | "ia" | "equipo";

const LINKS: { id: SettingsSection; label: string; href: string }[] = [
  { id: "general", label: "General", href: `${ROUTES.configuracion}?tab=general` },
  {
    id: "integraciones",
    label: "Integraciones",
    href: `${ROUTES.configuracion}?tab=integraciones`,
  },
  { id: "ia", label: "Motor de IA", href: `${ROUTES.configuracion}?tab=ia` },
  { id: "equipo", label: "Equipo", href: ROUTES.configuracionEquipo },
];

/** Pestañas de Configuración para subpáginas con ruta propia (p. ej. Equipo). */
export function SettingsSectionNav({ active }: { active: SettingsSection }) {
  return (
    <div className="mb-8 flex space-x-8 border-b border-outline-variant/40">
      {LINKS.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          aria-current={item.id === active ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-1 pb-3 text-sm font-semibold transition-colors",
            item.id === active
              ? "border-primary text-primary"
              : "border-transparent text-secondary hover:text-on-surface",
          )}
        >
          {item.label}
        </Link>
      ))}
      <span className="cursor-not-allowed px-1 pb-3 text-sm text-outline">
        Facturación
      </span>
    </div>
  );
}
