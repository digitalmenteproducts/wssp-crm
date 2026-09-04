# Agente IA — notas de diseño

## Debounce / agrupación de mensajes

No hay cola Redis ni worker dedicado. Estrategia MVP:

1. Tras persistir inbound, se dispara `processIncomingMessageWithAgent` en fire-and-forget.
2. Antes de responder, si existe un inbound **más nuevo** en la conversación, se omite (`mensaje_superado`).
3. Dedup duro: `ai_usage.source_message_id` UNIQUE.

Para un debounce temporal (p. ej. 3–5 s) haría falta un job diferido; documentado como mejora posterior.

## Tools futuros

Interfaces en `src/types/ai-agent.ts` (`AiAgentToolName`) sin implementación:
searchProducts, checkInventory, getProductDetails, createOrder, createReservation, sendPaymentLink.

## Clasificación vs Agente

- `business_settings.ai_engine_enabled` + cron = clasificación post-conversación.
- `ai_agent_settings.enabled` = auto-respuesta WhatsApp (off por defecto).
