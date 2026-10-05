"use client";

import {
  Bot,
  Building2,
  CalendarDays,
  ClipboardList,
  FileText,
  HelpCircle,
  LayoutDashboard,
  Layers,
  Megaphone,
  MessagesSquare,
  Plus,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import { BrandLogo } from "@/components/layout/brand-logo";
import { APP_NAME, ROUTES } from "@/config/app";
import { contactsNavLabel, hasClinicAgenda } from "@/lib/industry";
import { canAccessModule, type AppModule } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { BusinessIndustry, BusinessRole } from "@/types/business";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  module: AppModule;
  clinicOnly?: boolean;
};

const FOOTER_NAV = [
  { href: "#", label: "Ayuda", icon: HelpCircle },
  { href: "#", label: "Organización", icon: Building2 },
];

type AppSidebarProps = {
  industry?: BusinessIndustry;
  /** Solo oculta navegación; el acceso real se valida en servidor. */
  role: BusinessRole | null;
};

export function AppSidebar({ industry = "other", role }: AppSidebarProps) {
  const pathname = usePathname();

  const allNav: NavItem[] = [
    { href: ROUTES.panel, label: "Panel de Control", icon: LayoutDashboard, module: "dashboard" },
    { href: ROUTES.contactos, label: contactsNavLabel(industry), icon: Users, module: "contacts" },
    { href: ROUTES.conversaciones, label: "Conversaciones", icon: MessagesSquare, module: "conversations" },
    { href: ROUTES.agenda, label: "Agenda", icon: CalendarDays, module: "agenda", clinicOnly: true },
    { href: ROUTES.servicios, label: "Servicios", icon: ClipboardList, module: "services", clinicOnly: true },
    { href: ROUTES.segmentos, label: "Segmentos", icon: Layers, module: "campaigns" },
    { href: ROUTES.plantillas, label: "Plantillas", icon: FileText, module: "campaigns" },
    { href: ROUTES.campanas, label: "Campañas", icon: Megaphone, module: "campaigns" },
    { href: ROUTES.agenteIa, label: "Agente IA", icon: Bot, module: "ai_agent" },
    { href: ROUTES.configuracion, label: "Configuración", icon: Settings, module: "settings" },
  ];

  const primaryNav = allNav.filter(
    (item) =>
      role !== null &&
      canAccessModule(role, item.module) &&
      (!item.clinicOnly || hasClinicAgenda(industry)),
  );
  const canCreateCampaign = role !== null && canAccessModule(role, "campaigns");

  return (
    <nav className="fixed top-0 left-0 z-50 flex h-full w-[260px] flex-col border-r border-white/10 bg-sidebar px-4 py-6 text-sm text-sidebar-foreground">
      <div className="mb-8 flex items-center gap-3 px-2">
        <BrandLogo size={32} className="rounded-lg border-0 p-1 shadow-none" />
        <div>
          <p className="font-heading text-lg font-bold tracking-tight text-white">
            {APP_NAME}
          </p>
          <p className="text-xs text-slate-400">CRM Inteligente</p>
        </div>
      </div>

      {canCreateCampaign ? (
        <Link
          href={ROUTES.campanasNueva}
          className="mb-6 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border-t border-white/10 bg-primary-container text-sm font-semibold text-on-primary-container hover:bg-primary-container/90"
        >
          <Plus className="size-4" />
          Nueva Campaña
        </Link>
      ) : null}

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {primaryNav.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 transition-colors",
                active
                  ? "border-l-2 border-[#b7c4ff] bg-white/10 text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className="size-5 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="mt-auto space-y-1 border-t border-white/10 pt-4">
        {FOOTER_NAV.map((item) => {
          const Icon = item.icon;

          return (
            <Link
              key={item.label}
              href={item.href}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
            >
              <Icon className="size-5 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
