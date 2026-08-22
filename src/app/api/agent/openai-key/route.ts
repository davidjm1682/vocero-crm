import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { tokenLast4 } from "@/server/whatsapp/credentials";

export const dynamic = "force-dynamic";

/**
 * 022 — API key de OpenAI propia del cliente (bring-your-own-LLM-key).
 * Nea la lee vía GET /api/bot/profile cuando está presente; sin ella, sigue
 * usando la key por defecto de la instancia del bot.
 */

export const GET = withAuth(async (session) => {
  const db = getDb();
  const rows = await db
    .select({
      cipher: schema.agentProfile.openaiKeyCipher,
      iv: schema.agentProfile.openaiKeyIv,
      tag: schema.agentProfile.openaiKeyTag,
    })
    .from(schema.agentProfile)
    .where(scoped(schema.agentProfile.organizationId, session.organizationId))
    .limit(1);
  const p = rows[0];
  if (!p?.cipher || !p.iv || !p.tag) return Response.json({ connected: false });
  const key = decryptSecret({ cipher: p.cipher, iv: p.iv, tag: p.tag });
  return Response.json({ connected: true, tokenLast4: tokenLast4(key) });
});

const putSchema = z.object({
  apiKey: z.string().trim().min(20).max(200),
});

export const PUT = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;

  const check = await testOpenAiKey(body.data.apiKey);
  if (!check.ok) {
    return apiError(422, "invalid_key", check.message);
  }

  const enc = encryptSecret(body.data.apiKey);
  const db = getDb();
  const updated = await db
    .update(schema.agentProfile)
    .set({
      openaiKeyCipher: enc.cipher,
      openaiKeyIv: enc.iv,
      openaiKeyTag: enc.tag,
      updatedAt: new Date(),
    })
    .where(scoped(schema.agentProfile.organizationId, session.organizationId))
    .returning();
  if (!updated[0]) return apiError(404, "not_found", "Perfil no encontrado");
  return Response.json({ ok: true });
});

export const DELETE = withAuth(async (session) => {
  const db = getDb();
  await db
    .update(schema.agentProfile)
    .set({
      openaiKeyCipher: null,
      openaiKeyIv: null,
      openaiKeyTag: null,
      updatedAt: new Date(),
    })
    .where(scoped(schema.agentProfile.organizationId, session.organizationId));
  return Response.json({ ok: true });
});

async function testOpenAiKey(
  apiKey: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) return { ok: true };
    const json = (await res.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    return {
      ok: false,
      message: json?.error?.message ?? "La API key no es válida",
    };
  } catch {
    return {
      ok: false,
      message: "No se pudo validar la key con OpenAI; intenta de nuevo",
    };
  }
}
