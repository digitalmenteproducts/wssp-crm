export type MetaMessageTemplate = {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components?: Array<{
    type: string;
    text?: string;
    format?: string;
    example?: unknown;
  }>;
};

function mapMetaStatus(status: string):
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "paused"
  | "disabled" {
  const normalized = status.toUpperCase();
  if (normalized === "APPROVED") return "approved";
  if (normalized === "PENDING" || normalized === "IN_APPEAL") return "pending";
  if (normalized === "REJECTED") return "rejected";
  if (normalized === "PAUSED") return "paused";
  if (normalized === "DISABLED" || normalized === "DELETED") return "disabled";
  return "draft";
}

export function extractTemplateContent(
  components: MetaMessageTemplate["components"],
): string {
  if (!components?.length) return "";

  const parts: string[] = [];
  for (const component of components) {
    if (component.type === "HEADER" && component.text) {
      parts.push(component.text);
    }
    if (component.type === "BODY" && component.text) {
      parts.push(component.text);
    }
    if (component.type === "FOOTER" && component.text) {
      parts.push(component.text);
    }
  }

  return parts.join("\n\n");
}

export async function fetchMetaMessageTemplates(input: {
  accessToken: string;
  wabaId: string;
}): Promise<
  | { ok: true; templates: MetaMessageTemplate[] }
  | { ok: false; error: string }
> {
  const url = new URL(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(input.wabaId)}/message_templates`,
  );
  url.searchParams.set("limit", "100");
  url.searchParams.set(
    "fields",
    "id,name,status,category,language,components",
  );

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    data?: MetaMessageTemplate[];
    error?: { message?: string };
  };

  if (!response.ok) {
    return {
      ok: false,
      error:
        payload.error?.message ??
        `Meta respondió ${response.status} al listar plantillas.`,
    };
  }

  return { ok: true, templates: payload.data ?? [] };
}

export { mapMetaStatus };
