/**
 * Dominio público de la app. Nunca usar el dashboard de Vercel
 * (`vercel.com/<team>/<project>`).
 */
export function normalizePublicAppUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    // Dashboard / consola de Vercel — no es el origen de la app.
    if (url.hostname === "vercel.com") {
      return null;
    }
    return url.origin.replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function appBaseUrl(): string {
  // Preferir APP_URL server-side (runtime) para no depender solo del inline de build.
  const fromServer = normalizePublicAppUrl(process.env.APP_URL);
  if (fromServer) return fromServer;

  const fromPublic = normalizePublicAppUrl(process.env.NEXT_PUBLIC_APP_URL);
  if (fromPublic) return fromPublic;

  return "http://localhost:3000";
}
