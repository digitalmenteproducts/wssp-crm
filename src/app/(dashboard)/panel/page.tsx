import type { Metadata } from "next";
import {
  FileText,
  Layers,
  Sparkles,
  UserCheck,
  UserMinus,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/layout/stat-card";

export const metadata: Metadata = {
  title: "Panel de control",
};

/**
 * Métricas del dashboard según PRD §12.
 * Valores en 0 hasta existir datos (Sprints 2–3).
 */
const DASHBOARD_STATS = [
  {
    label: "Contactos",
    value: "0",
    hint: "Total sincronizados",
    icon: Users,
  },
  {
    label: "Analizados",
    value: "0",
    hint: "Conversaciones clasificadas por IA",
    icon: Sparkles,
    highlight: true,
  },
  {
    label: "No compradores",
    value: "0",
    hint: "Oportunidades de recuperación",
    icon: UserMinus,
  },
  {
    label: "Clientes",
    value: "0",
    hint: "Contactos convertidos",
    icon: UserCheck,
  },
  {
    label: "Segmentos",
    value: "0",
    hint: "Segmentos dinámicos activos",
    icon: Layers,
  },
  {
    label: "Plantillas",
    value: "0",
    hint: "Plantillas de WhatsApp",
    icon: FileText,
  },
] as const;

export default function PanelPage() {
  return (
    <>
      <PageHeader
        title="Resumen del Panel de Control"
        description="Esto es lo que sucede con tus contactos hoy."
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {DASHBOARD_STATS.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            hint={stat.hint}
            icon={stat.icon}
            highlight={"highlight" in stat ? stat.highlight : false}
          />
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-outline-variant/50 bg-card p-6">
        <h2 className="font-heading text-lg font-semibold text-on-surface">
          Próximos pasos
        </h2>
        <p className="mt-2 text-sm text-secondary">
          El shell del panel ya está listo. En el resto del Sprint 1
          configuraremos empresas e integraciones. Los números se llenarán
          cuando lleguen WhatsApp (Sprint 2) y la clasificación con IA (Sprint
          3).
        </p>
      </div>
    </>
  );
}
