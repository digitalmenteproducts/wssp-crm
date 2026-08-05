import type { ContactBoardStatus } from "@/types";

export type ContactBoardCard = {
  id: string;
  phone: string;
  name: string | null;
  status: ContactBoardStatus;
  conversationId: string | null;
  lastMessageAt: string | null;
  lastMessageBody: string | null;
  product: string | null;
  summary: string | null;
  segment: string | null;
  tags: string[];
  confidence: number | null;
  aiStatus: string | null;
};

export type ContactBoardColumn = {
  status: ContactBoardStatus;
  label: string;
  cards: ContactBoardCard[];
};

export type ContactBoard = {
  columns: ContactBoardColumn[];
  totalContacts: number;
  messagesCount: number;
  analyzedCount: number;
};

export const CONTACT_BOARD_STATUSES: ContactBoardStatus[] = [
  "nuevo",
  "interesado",
  "no_compro",
  "cliente",
  "no_contactar",
];

export const CONTACT_BOARD_LABELS: Record<ContactBoardStatus, string> = {
  nuevo: "Nuevo",
  interesado: "Interesado",
  no_compro: "No compró",
  cliente: "Cliente",
  no_contactar: "No contactar",
};
