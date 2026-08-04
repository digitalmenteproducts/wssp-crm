import Image from "next/image";

import { APP_NAME } from "@/config/app";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  size?: number;
  priority?: boolean;
};

export function BrandLogo({
  className,
  size = 64,
  priority = false,
}: BrandLogoProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center overflow-hidden rounded-xl border border-outline-variant bg-card p-2 shadow-sm",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src="/brand/logo.png"
        alt={APP_NAME}
        width={size}
        height={size}
        className="h-full w-full object-contain"
        priority={priority}
      />
    </div>
  );
}
