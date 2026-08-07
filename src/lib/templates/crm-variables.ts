/**
 * Variables posicionales que Meta exige ({{1}}, {{2}}…) y cómo WhatsCRM
 * las rellena al enviar campañas.
 */
export type CrmTemplateVariable = {
  key: string;
  token: string;
  label: string;
  description: string;
  example: string;
};

export const CRM_TEMPLATE_VARIABLES: CrmTemplateVariable[] = [
  {
    key: "1",
    token: "{{1}}",
    label: "Nombre",
    description: "Nombre del contacto",
    example: "María",
  },
  {
    key: "2",
    token: "{{2}}",
    label: "Producto",
    description: "Producto de interés del contacto",
    example: "Pizza Margarita",
  },
  {
    key: "3",
    token: "{{3}}",
    label: "Valor libre",
    description: "Texto fijo de la campaña (ej. descuento)",
    example: "20%",
  },
];

export function getCrmVariableMeta(
  key: string,
): CrmTemplateVariable | undefined {
  return CRM_TEMPLATE_VARIABLES.find((item) => item.key === key);
}

/** Valores de contacto / campaña usados al enviar plantillas. */
export function buildCrmVariableValues(contact: {
  name: string | null;
  product: string | null;
}): Record<string, string> {
  return {
    "1": contact.name?.trim() || "cliente",
    "2": contact.product?.trim() || "tu pedido",
    "3": "10%",
    name: contact.name?.trim() || "cliente",
    product: contact.product?.trim() || "tu pedido",
  };
}
