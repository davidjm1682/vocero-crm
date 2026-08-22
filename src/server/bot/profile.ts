import type { schema } from "@/lib/db";
import { renderKb } from "@/server/ai/prompts";

type AgentProfile = typeof schema.agentProfile.$inferSelect;
type KbEntry = typeof schema.kbEntry.$inferSelect;

/**
 * Payload del perfil del agente para un cerebro externo.
 *
 * `enabled` NO viaja: ese flag gobierna la IA in-process de Vocero; el bot
 * externo se pausa por conversación (`aiEnabled` del contexto y los handoffs),
 * no por este endpoint. `resources` nace vacío para que el shape del consumidor
 * no cambie cuando existan recursos alternativos reales.
 *
 * `openaiApiKey` (022): ya descifrada por el caller (route.ts, que tiene el
 * acceso a lib/crypto) — este módulo se mantiene puro. NULL = el cliente no
 * puso su propia key; el bot externo sigue usando la suya por defecto.
 */
export function serializeBotProfile(
  profile: AgentProfile,
  kb: KbEntry[],
  openaiApiKey: string | null = null
) {
  return {
    profile: {
      name: profile.name,
      tone: profile.tone ?? null,
      instructions: profile.instructions ?? null,
      escalationRules: profile.escalationRules ?? null,
      greeting: profile.greeting ?? null,
    },
    kb: renderKb(kb),
    resources: [] as { label: string; url: string }[],
    openaiApiKey,
  };
}
