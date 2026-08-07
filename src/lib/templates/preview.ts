import { CRM_TEMPLATE_VARIABLES } from "@/lib/templates/crm-variables";

export function previewTemplateContent(
  content: string,
  sampleValues?: Record<string, string>,
): string {
  const defaults: Record<string, string> = Object.fromEntries(
    CRM_TEMPLATE_VARIABLES.map((item) => [item.key, item.example]),
  );
  defaults.name = defaults["1"] ?? "María";
  defaults.product = defaults["2"] ?? "Pizza Margarita";

  const values = { ...defaults, ...sampleValues };

  return content.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    return values[key] ?? `[${key}]`;
  });
}

export function extractTemplateVariables(content: string): string[] {
  const matches = content.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g);
  const seen = new Set<string>();
  const variables: string[] = [];

  for (const match of matches) {
    const key = match[1];
    if (!seen.has(key)) {
      seen.add(key);
      variables.push(key);
    }
  }

  return variables;
}
