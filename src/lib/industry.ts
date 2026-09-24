import type { BusinessIndustry } from "@/types/business";

export function hasClinicAgenda(industry: BusinessIndustry | string): boolean {
  return industry === "clinic";
}

export function contactsNavLabel(industry: BusinessIndustry | string): string {
  return industry === "clinic" ? "Pacientes" : "Contactos";
}

export function contactSingularLabel(
  industry: BusinessIndustry | string,
): string {
  return industry === "clinic" ? "Paciente" : "Contacto";
}

export function newContactLabel(industry: BusinessIndustry | string): string {
  return industry === "clinic" ? "Nuevo paciente" : "Nuevo contacto";
}
