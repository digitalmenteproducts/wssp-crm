export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function maskSecret(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (value.length <= 4) {
    return "••••";
  }

  return `••••${value.slice(-4)}`;
}

export function isSecretProvided(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
