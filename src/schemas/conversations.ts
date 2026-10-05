import { z } from "zod";

export const conversationIdSchema = z.string().uuid("Conversación inválida.");
