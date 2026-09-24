import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { getCurrentUser } from "@/repositories/auth.repository";
import * as businessService from "@/services/business/business.service";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { data } = await getCurrentUser();
  const workspace = await businessService.getCurrentWorkspace();
  const industry =
    workspace.ok && workspace.workspace
      ? workspace.workspace.business.industry
      : "other";

  return (
    <div className="flex min-h-full flex-1 bg-background text-on-surface">
      <AppSidebar industry={industry} />
      <div className="ml-[260px] flex min-h-screen flex-1 flex-col">
        <AppHeader userEmail={data.user?.email} />
        <main className="mt-16 flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-[1440px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
