import type { TemplateButton } from "@/types/templates";

export type MetaMessageTemplate = {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  rejected_reason?: string;
  components?: Array<{
    type: string;
    text?: string;
    format?: string;
    example?: unknown;
    buttons?: Array<Record<string, unknown>>;
  }>;
};

export type CreateMetaTemplateInput = {
  accessToken: string;
  wabaId: string;
  name: string;
  language: string;
  category: "MARKETING" | "UTILITY";
  headerText?: string | null;
  bodyText: string;
  footerText?: string | null;
  buttons?: TemplateButton[];
  bodyExamples: string[];
};

function mapMetaStatus(status: string):
  | "draft"
  | "submitting"
  | "pending"
  | "approved"
  | "rejected"
  | "paused"
  | "disabled"
  | "error" {
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

  const body = components.find((component) => component.type === "BODY");
  return body?.text ?? "";
}

export function extractHeaderText(
  components: MetaMessageTemplate["components"],
): string | null {
  const header = components?.find((component) => component.type === "HEADER");
  return header?.text ?? null;
}

export function extractFooterText(
  components: MetaMessageTemplate["components"],
): string | null {
  const footer = components?.find((component) => component.type === "FOOTER");
  return footer?.text ?? null;
}

export function extractButtons(
  components: MetaMessageTemplate["components"],
): TemplateButton[] {
  const block = components?.find((component) => component.type === "BUTTONS");
  if (!block?.buttons?.length) return [];

  const buttons: TemplateButton[] = [];
  for (const button of block.buttons) {
    const type = String(button.type ?? "").toUpperCase();
    const text = String(button.text ?? "").trim();
    if (!text) continue;

    if (type === "QUICK_REPLY") {
      buttons.push({ type: "QUICK_REPLY", text });
    } else if (type === "URL") {
      buttons.push({
        type: "URL",
        text,
        url: String(button.url ?? ""),
      });
    } else if (type === "PHONE_NUMBER") {
      buttons.push({
        type: "PHONE_NUMBER",
        text,
        phone_number: String(button.phone_number ?? ""),
      });
    }
  }

  return buttons;
}

function buildComponents(input: CreateMetaTemplateInput) {
  const components: Array<Record<string, unknown>> = [];

  if (input.headerText?.trim()) {
    components.push({
      type: "HEADER",
      format: "TEXT",
      text: input.headerText.trim(),
    });
  }

  const body: Record<string, unknown> = {
    type: "BODY",
    text: input.bodyText,
  };

  if (input.bodyExamples.length > 0) {
    body.example = {
      body_text: [input.bodyExamples],
    };
  }

  components.push(body);

  if (input.footerText?.trim()) {
    components.push({
      type: "FOOTER",
      text: input.footerText.trim(),
    });
  }

  if (input.buttons && input.buttons.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: input.buttons.map((button) => {
        if (button.type === "URL") {
          return {
            type: "URL",
            text: button.text,
            url: button.url,
          };
        }
        if (button.type === "PHONE_NUMBER") {
          return {
            type: "PHONE_NUMBER",
            text: button.text,
            phone_number: button.phone_number,
          };
        }
        return {
          type: "QUICK_REPLY",
          text: button.text,
        };
      }),
    });
  }

  return components;
}

export async function createMetaMessageTemplate(
  input: CreateMetaTemplateInput,
): Promise<
  | {
      ok: true;
      id: string;
      status: string;
      category: string;
      raw: Record<string, unknown>;
    }
  | { ok: false; error: string; raw?: Record<string, unknown> }
> {
  const response = await fetch(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(input.wabaId)}/message_templates`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: input.name,
        language: input.language,
        category: input.category,
        allow_category_change: true,
        components: buildComponents(input),
      }),
      cache: "no-store",
    },
  );

  const payload = (await response.json()) as {
    id?: string;
    status?: string;
    category?: string;
    error?: { message?: string; error_user_msg?: string };
  };

  if (!response.ok || !payload.id) {
    return {
      ok: false,
      error:
        payload.error?.error_user_msg ??
        payload.error?.message ??
        `Meta respondió ${response.status} al crear la plantilla.`,
      raw: payload as Record<string, unknown>,
    };
  }

  return {
    ok: true,
    id: payload.id,
    status: payload.status ?? "PENDING",
    category: payload.category ?? input.category,
    raw: payload as Record<string, unknown>,
  };
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
    "id,name,status,category,language,components,rejected_reason",
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
