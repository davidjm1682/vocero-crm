import { scheduleAgentTurn } from "@/server/ai/pipeline";

/**
 * Punto de enganche del turno del agente tras la ingesta de un mensaje
 * entrante REAL (las conversaciones del Laboratorio invocan el pipeline
 * directamente, sin debounce). El propio turno decide si hay proveedor de IA
 * configurado (por organización o por variables de entorno) — chequearlo
 * aquí requeriría una consulta a BD que el turno ya hace de todos modos.
 */
export async function maybeRunAgentTurn(
  conversationId: string
): Promise<void> {
  scheduleAgentTurn(conversationId);
}
