/**
 * Convierte un nombre amigable en el nombre técnico que exige Meta.
 */
export function slugifyTemplateName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .slice(0, 512);
}

export function validateConsecutivePositionalVariables(
  content: string,
): { ok: true; variables: string[] } | { ok: false; error: string } {
  const vars = Array.from(content.matchAll(/\{\{\s*(\d+)\s*\}\}/g)).map(
    (match) => match[1],
  );
  const unique = Array.from(new Set(vars)).sort(
    (a, b) => Number(a) - Number(b),
  );

  for (let i = 0; i < unique.length; i += 1) {
    if (unique[i] !== String(i + 1)) {
      return {
        ok: false,
        error: "Las variables deben ser consecutivas: {{1}}, {{2}}, {{3}}…",
      };
    }
  }

  return { ok: true, variables: unique };
}
