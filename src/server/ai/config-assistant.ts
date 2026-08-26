import { z } from "zod";
import { chatJson, type ChatMessage } from "@/lib/ai";
import { CONFIG_ASSISTANT_MARKER } from "@/server/ai/prompts";

/**
 * Asistente conversacional de configuración del agente (005): reutiliza
 * chatJson tal cual — mismo proveedor, mismos reintentos, misma extracción
 * robusta — para convertir 4 respuestas en lenguaje natural en una
 * propuesta de tono/instrucciones/reglas de escalado.
 */

export const configAssistantAnswersSchema = z.object({
  canal: z.string().trim().min(1).max(200),
  negocio: z.string().trim().min(1).max(1000),
  tono: z.string().trim().min(1).max(500),
  escalado: z.string().trim().min(1).max(500),
});

export type ConfigAssistantAnswers = z.infer<typeof configAssistantAnswersSchema>;

const proposalSchema = z.object({
  tone: z.string().trim().min(1),
  instructions: z.string().trim().min(1),
  escalationRules: z.string().trim().min(1),
});

export type ConfigAssistantProposal = z.infer<typeof proposalSchema>;

export function buildConfigAssistantPrompt(
  answers: ConfigAssistantAnswers
): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        `${CONFIG_ASSISTANT_MARKER} ` +
        "Eres un asistente que ayuda a configurar a OTRO agente de IA de atención al cliente por WhatsApp, a partir de las respuestas de un dueño de negocio sin experiencia técnica. " +
        "Con esas respuestas, genera: (1) 'tone' — una descripción breve y concreta de cómo debe sonar el agente al escribir; (2) 'instructions' — instrucciones claras de qué debe y no debe hacer el agente, en base al negocio descrito; (3) 'escalationRules' — bajo qué condiciones el agente debe escalar la conversación a un humano. " +
        "Responde ÚNICAMENTE un objeto JSON con las claves 'tone', 'instructions' y 'escalationRules', las tres como texto no vacío, sin markdown ni explicaciones adicionales.",
    },
    {
      role: "user",
      content:
        `Canal principal de atención: ${answers.canal}\n` +
        `A qué se dedica el negocio: ${answers.negocio}\n` +
        `Cómo debe sonar el agente: ${answers.tono}\n` +
        `Cuándo debe escalar a un humano: ${answers.escalado}`,
    },
  ];
}

export async function generateConfigAssistantProposal(
  organizationId: string,
  answers: ConfigAssistantAnswers
) {
  const messages = buildConfigAssistantPrompt(answers);
  return chatJson(proposalSchema, messages, { organizationId });
}
