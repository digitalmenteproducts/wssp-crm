import type { Metadata } from "next";

import { AiAgentWorkspace } from "@/components/ai-agent/ai-agent-workspace";
import { PageHeader } from "@/components/layout/page-header";
import * as aiAgentService from "@/services/ai/ai-agent.service";
import * as businessService from "@/services/business/business.service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Agente IA",
};

export default async function AgenteIaPage() {
  const [pageData, workspace] = await Promise.all([
    aiAgentService.getAiAgentPageData(),
    businessService.getCurrentWorkspace(),
  ]);

  const role = workspace.ok
    ? workspace.workspace?.membership.role
    : undefined;
  const canEdit = role === "owner" || role === "admin";

  return (
    <>
      <PageHeader
        title="Agente IA"
        description="Configura el asistente comercial de tu empresa, su base de conocimiento y pruébalo antes de activarlo en WhatsApp."
      />

      {!pageData.ok ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {pageData.error}
        </div>
      ) : (
        <AiAgentWorkspace
          settings={pageData.settings}
          knowledge={pageData.knowledge}
          openAiConfigured={pageData.openAiConfigured}
          canEdit={canEdit}
        />
      )}
    </>
  );
}
