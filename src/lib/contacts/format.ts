export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Sin mensajes";

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Sin mensajes";

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 1) return "Ahora";
  if (minutes < 60) return `Hace ${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `Hace ${days}d`;

  return date.toLocaleDateString("es", {
    day: "numeric",
    month: "short",
  });
}

export function whatsappLink(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}`;
}
