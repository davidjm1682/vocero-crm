import { withAuth } from "@/lib/api";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * 023 — Catálogo de modelos de OpenRouter (endpoint público del proveedor,
 * no requiere el token del cliente) para poblar el selector en Settings en
 * vez de que el usuario tenga que escribir el identificador de memoria.
 */
type OpenRouterModel = {
  id?: string;
  name?: string;
  context_length?: number;
  architecture?: { input_modalities?: string[] };
  pricing?: { prompt?: string; completion?: string };
};

export const GET = withAuth(async () => {
  const env = getEnv();
  try {
    const res = await fetch(`${env.OPENROUTER_BASE_URL}/v1/models`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return Response.json({ models: [] });
    const json = (await res.json().catch(() => null)) as {
      data?: OpenRouterModel[];
    } | null;
    const models = (json?.data ?? [])
      .filter((m): m is OpenRouterModel & { id: string } => !!m.id)
      .map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        contextLength: m.context_length ?? null,
        vision: m.architecture?.input_modalities?.includes("image") ?? false,
        // USD por millón de tokens (el proveedor los da por token, como string)
        promptPricePerM: toPricePerMillion(m.pricing?.prompt),
        completionPricePerM: toPricePerMillion(m.pricing?.completion),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return Response.json({ models });
  } catch {
    return Response.json({ models: [] });
  }
});

function toPricePerMillion(perToken: string | undefined): number | null {
  if (!perToken) return null;
  const n = Number(perToken);
  return Number.isFinite(n) ? n * 1_000_000 : null;
}
