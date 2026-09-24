/**
 * Normalización de teléfonos alineada con el webhook de WhatsApp:
 * solo dígitos (sin +, espacios ni símbolos).
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}
