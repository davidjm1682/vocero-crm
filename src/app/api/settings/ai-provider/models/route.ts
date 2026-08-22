import { withAuth } from "@/lib/api";
import { getEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * 023 — Catálogo de modelos de OpenRouter (endpoint público del proveedor,
 * no requiere el token del cliente) para poblar el selector en Settings en
 * vez de que el usuario tenga que escribir el identificador de memoria.
 */
export const GET = withAuth(async () => {
  const env = getEnv();
  try {
    const res = await fetch(`${env.OPENROUTER_BASE_URL}/v1/models`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return Response.json({ models: [] });
    const json = (await res.json().catch(() => null)) as {
      data?: { id?: string; name?: string }[];
    } | null;
    const models = (json?.data ?? [])
      .filter((m): m is { id: string; name?: string } => !!m.id)
      .map((m) => ({ id: m.id, name: m.name ?? m.id }))
      .sort((a, b) => a.id.localeCompare(b.id));
    return Response.json({ models });
  } catch {
    return Response.json({ models: [] });
  }
});
