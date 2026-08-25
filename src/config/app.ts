export const APP_NAME = "WhatsCRM AI";
export const APP_BRAND = "Digitalmente CRM";
export const APP_SLUG = "whatscrm-mvp";
export const APP_DESCRIPTION =
  "Segmentación y recuperación comercial por WhatsApp con IA";
export const APP_TAGLINE = "CRM inteligente para equipos modernos.";

/** Contacto público para privacidad / eliminación de datos (Meta App Review). */
export const PRIVACY_CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL?.trim() ||
  "digitalmente.products@gmail.com";

export const ROUTES = {
  home: "/",
  login: "/login",
  registro: "/registro",
  recuperar: "/recuperar",
  privacyPolicy: "/privacy-policy",
  panel: "/panel",
  contactos: "/contactos",
  segmentos: "/segmentos",
  plantillas: "/plantillas",
  campanas: "/campanas",
  campanasNueva: "/campanas/nueva",
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
  ROUTES.campanas,
  ROUTES.configuracion,
] as const;
