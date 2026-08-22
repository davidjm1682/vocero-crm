import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getEnv } from "@/lib/env";
import {
  deleteAiProviderCredentials,
  getAiProviderCredentials,
  saveAiProviderCredentials,
  tokenLast4,
} from "@/server/ai-provider/credentials";

export const dynamic = "force-dynamic";

/**
 * 023 — Proveedor de IA OpenRouter-compatible por instancia. Alimenta el
 * agente in-process del CRM y el Laboratorio; sin conexión, ambos caen a
 * OPENROUTER_API_TOKEN/MODEL de la plataforma de hosting (retrocompatible).
 */

export const GET = withAuth(async (session) => {
  const creds = await getAiProviderCredentials(session.organizationId);
  if (!creds) return Response.json({ connection: null });
  return Response.json({
    connection: {
      model: creds.model,
      judgeModel: creds.judgeModel,
      tokenLast4: tokenLast4(creds.token),
    },
  });
});

const putSchema = z.object({
  token: z.string().trim().min(10).max(200),
  model: z.string().trim().min(1).max(120),
  judgeModel: z.string().trim().max(120).nullable().optional(),
});

/** Guarda la conexión: valida el token+modelo contra el proveedor antes de cifrar. */
export const PUT = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;

  const check = await testProvider(body.data.token, body.data.model);
  if (!check.ok) {
    const status = check.code === "provider_unavailable" ? 503 : 422;
    return apiError(status, check.code, check.message);
  }

  await saveAiProviderCredentials({
    organizationId: session.organizationId,
    token: body.data.token,
    model: body.data.model,
    judgeModel: body.data.judgeModel || null,
  });

  return Response.json({ ok: true });
});

export const DELETE = withAuth(async (session) => {
  await deleteAiProviderCredentials(session.organizationId);
  return Response.json({ ok: true });
});

async function testProvider(
  token: string,
  model: string
): Promise<
  | { ok: true }
  | {
      ok: false;
      code: "invalid_credentials" | "provider_unavailable";
      message: string;
    }
> {
  const env = getEnv();
  try {
    const res = await fetch(`${env.OPENROUTER_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "di 'ok'" }],
        max_tokens: 5,
      }),
    });
    if (res.ok) return { ok: true };
    const json = (await res.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    return {
      ok: false,
      code: "invalid_credentials",
      message:
        json?.error?.message ??
        "El token o el modelo no son válidos para este proveedor",
    };
  } catch {
    return {
      ok: false,
      code: "provider_unavailable",
      message: "No se pudo contactar al proveedor; intenta de nuevo",
    };
  }
}
