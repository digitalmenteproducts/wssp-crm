"use client";

import {
  Building2,
  FileText,
  HelpCircle,
  LayoutDashboard,
  Layers,
  Plus,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import { BrandLogo } from "@/components/layout/brand-logo";
import { Button } from "@/components/ui/button";
import { APP_NAME, ROUTES } from "@/config/app";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const PRIMARY_NAV: NavItem[] = [
  { href: ROUTES.panel, label: "Panel de Control", icon: LayoutDashboard },
  { href: ROUTES.contactos, label: "Contactos", icon: Users },
  { href: ROUTES.segmentos, label: "Segmentos", icon: Layers },
  { href: ROUTES.plantillas, label: "Plantillas", icon: FileText },
  { href: ROUTES.configuracion, label: "Configuración", icon: Settings },
];

const FOOTER_NAV: NavItem[] = [
  { href: "#", label: "Ayuda", icon: HelpCircle },
  { href: "#", label: "Organización", icon: Building2 },
];

export function AppSidebar() {
  const pathname = usePathname();

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

      <Button
        type="button"
        disabled
        title="Las campañas llegan en el Sprint 6"
        className="mb-6 h-10 w-full justify-center gap-2 rounded-lg border-t border-white/10 bg-primary-container text-sm font-semibold text-on-primary-container hover:bg-primary-container/90 disabled:opacity-60"
      >
        <Plus className="size-4" />
        Nueva Campaña
      </Button>

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {PRIMARY_NAV.map((item) => {
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
