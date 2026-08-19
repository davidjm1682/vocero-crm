import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { MetaApiError } from "@/lib/meta/client";
import {
  deleteAdsCredentials,
  getAdsCredentialsByOrg,
  saveAdsCredentials,
  tokenLast4,
} from "@/server/ads/credentials";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const creds = await getAdsCredentialsByOrg(session.organizationId);
  if (!creds) return Response.json({ connection: null });
  return Response.json({
    connection: {
      datasetId: creds.datasetId,
      status: creds.status,
      tokenLast4: tokenLast4(creds.token),
    },
  });
});

const putSchema = z.object({
  datasetId: z.string().trim().min(1),
  token: z.string().trim().min(1),
});

/** Guarda la conexión: valida el token contra el dataset antes de cifrar y persistir. */
export const PUT = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;

  const check = await testAdsConnection(body.data.datasetId, body.data.token);
  if (!check.ok) {
    const status = check.code === "meta_unavailable" ? 503 : 422;
    return apiError(status, check.code, check.message);
  }

  await saveAdsCredentials({
    organizationId: session.organizationId,
    datasetId: body.data.datasetId,
    token: body.data.token,
  });

  return Response.json({ ok: true });
});

export const DELETE = withAuth(async (session) => {
  await deleteAdsCredentials(session.organizationId);
  return Response.json({ ok: true });
});

async function testAdsConnection(
  datasetId: string,
  token: string
): Promise<
  | { ok: true }
  | { ok: false; code: "invalid_credentials" | "meta_unavailable"; message: string }
> {
  const env = getEnv();
  const url = `${env.META_ADS_GRAPH_BASE_URL}/${env.META_GRAPH_API_VERSION}/${datasetId}?fields=id&access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url);
    if (res.ok) return { ok: true };
    const json = (await res.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    return {
      ok: false,
      code: "invalid_credentials",
      message:
        json?.error?.message ??
        "El dataset ID o el token no son válidos, o el token no tiene permiso ads_management sobre ese dataset",
    };
  } catch (cause) {
    if (cause instanceof MetaApiError) {
      return { ok: false, code: "meta_unavailable", message: cause.message };
    }
    return {
      ok: false,
      code: "meta_unavailable",
      message: "No se pudo contactar Meta; intenta de nuevo",
    };
  }
}
