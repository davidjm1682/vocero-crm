import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  configAssistantAnswersSchema,
  generateConfigAssistantProposal,
} from "@/server/ai/config-assistant";

export const dynamic = "force-dynamic";

/**
 * Solo GENERA una propuesta — nunca escribe en agentProfile. Aplicar el
 * resultado sigue pasando por el PUT /api/agent/profile ya existente, tras
 * confirmación explícita del dueño en la UI (FR-012).
 */
export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, configAssistantAnswersSchema);
  if (!body.ok) return body.response;

  const result = await generateConfigAssistantProposal(
    session.organizationId,
    body.data
  );

  if (!result.ok) {
    if (result.error === "not_configured") {
      return apiError(
        409,
        "not_configured",
        "Configura un proveedor de IA en Settings antes de usar el asistente"
      );
    }
    return apiError(
      502,
      "provider_error",
      "El proveedor de IA no respondió correctamente. Intenta de nuevo."
    );
  }

  return Response.json({ proposal: result.data });
});
