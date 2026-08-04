import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  highlight?: boolean;
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  highlight = false,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col justify-between overflow-hidden rounded-xl border p-5 transition-colors",
        highlight
          ? "border-[#b7c4ff] bg-gradient-to-br from-card to-[#dde1ff]/40 shadow-sm"
          : "border-outline-variant/50 bg-card hover:border-[#b7c4ff]",
      )}
    >
      {Icon ? (
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <Icon className="size-16 text-primary" />
        </div>
      ) : null}
      <div className="relative z-10 mb-4">
        <span className="text-[13px] font-medium text-secondary">{label}</span>
      </div>
      <div className="relative z-10">
        <p className="font-heading text-[32px] leading-10 font-semibold text-on-surface">
          {value}
        </p>
        {hint ? <p className="mt-1 text-xs text-secondary">{hint}</p> : null}
      </div>
    </div>
  );
}
