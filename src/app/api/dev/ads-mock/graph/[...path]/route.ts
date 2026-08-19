import { mockGuard } from "@/lib/dev-guard";

/**
 * Imitación de Meta Conversions API para self-test (021). El cliente real
 * apunta aquí cuando META_ADS_GRAPH_BASE_URL = <app>/api/dev/ads-mock/graph.
 * Cubre lo mínimo: validar token de dataset (GET) y aceptar/rechazar eventos
 * (POST .../events), igual que el mock de WhatsApp gatea por sufijo -invalid.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ path: string[] }> };

function normalizePath(path: string[]): string[] {
  return path[0] && /^v\d+/.test(path[0]) ? path.slice(1) : path;
}

function invalidTokenResponse(): Response {
  return Response.json(
    {
      error: {
        message: "Invalid OAuth access token",
        type: "OAuthException",
        code: 190,
        fbtrace_id: "mock",
      },
    },
    { status: 401 }
  );
}

export async function GET(req: Request, ctx: Params) {
  const guard = mockGuard();
  if (guard) return guard;
  const path = normalizePath((await ctx.params).path);
  const url = new URL(req.url);
  const token = url.searchParams.get("access_token") ?? "";
  if (token.endsWith("-invalid")) return invalidTokenResponse();

  // GET {datasetId}?fields=id → validación de la conexión (settings/meta-ads)
  if (path.length === 1) {
    return Response.json({ id: path[0] });
  }
  return Response.json({ error: { message: "not found" } }, { status: 404 });
}

export async function POST(req: Request, ctx: Params) {
  const guard = mockGuard();
  if (guard) return guard;
  const path = normalizePath((await ctx.params).path);
  const body = (await req.json().catch(() => null)) as {
    access_token?: string;
  } | null;
  const token = body?.access_token ?? "";
  if (token.endsWith("-invalid")) return invalidTokenResponse();

  // POST {datasetId}/events → recepción del evento de conversión
  if (path.length === 2 && path[1] === "events") {
    return Response.json({ events_received: 1, fbtrace_id: "mock" });
  }
  return Response.json({ error: { message: "not found" } }, { status: 404 });
}
