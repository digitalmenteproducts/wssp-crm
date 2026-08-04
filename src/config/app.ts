export const APP_NAME = "WhatsCRM AI";
export const APP_SLUG = "whatscrm-mvp";
export const APP_DESCRIPTION =
  "Segmentación y recuperación comercial por WhatsApp con IA";
export const APP_TAGLINE = "CRM inteligente para equipos modernos.";

export const ROUTES = {
  home: "/",
  login: "/login",
  registro: "/registro",
  recuperar: "/recuperar",
  panel: "/panel",
  contactos: "/contactos",
  segmentos: "/segmentos",
  plantillas: "/plantillas",
  configuracion: "/configuracion",
} as const;

export const AUTH_ROUTES = [
  ROUTES.login,
  ROUTES.registro,
  ROUTES.recuperar,
] as const;

export const PROTECTED_PREFIXES = [
  ROUTES.panel,
  ROUTES.contactos,
  ROUTES.segmentos,
  ROUTES.plantillas,
  ROUTES.configuracion,
] as const;
