import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { scoped } from "@/lib/db/tenant";
import { isAiConfigured } from "@/lib/env";

/**
 * 023 — Proveedor de IA (OpenRouter-compatible) configurable por instancia.
 * Sin fila para la organización, `lib/ai` cae a las variables de entorno de
 * proceso (OPENROUTER_API_TOKEN/MODEL) — retrocompatible.
 */

export type AiProviderCredentials = {
  id: string;
  organizationId: string;
  token: string;
  model: string;
  judgeModel: string | null;
};

type Row = typeof schema.aiProviderCredentials.$inferSelect;

function toCredentials(row: Row): AiProviderCredentials {
  return {
    id: row.id,
    organizationId: row.organizationId,
    token: decryptSecret({
      cipher: row.tokenCipher,
      iv: row.tokenIv,
      tag: row.tokenTag,
    }),
    model: row.model,
    judgeModel: row.judgeModel,
  };
}

export async function getAiProviderCredentials(
  organizationId: string
): Promise<AiProviderCredentials | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.aiProviderCredentials)
    .where(scoped(schema.aiProviderCredentials.organizationId, organizationId))
    .limit(1);
  return rows[0] ? toCredentials(rows[0]) : null;
}

export async function saveAiProviderCredentials(input: {
  organizationId: string;
  token: string;
  model: string;
  judgeModel?: string | null;
}): Promise<void> {
  const db = getDb();
  const enc = encryptSecret(input.token);
  await db
    .insert(schema.aiProviderCredentials)
    .values({
      id: newId("aiProviderCredentials"),
      organizationId: input.organizationId,
      tokenCipher: enc.cipher,
      tokenIv: enc.iv,
      tokenTag: enc.tag,
      model: input.model,
      judgeModel: input.judgeModel ?? null,
    })
    .onConflictDoUpdate({
      target: [schema.aiProviderCredentials.organizationId],
      set: {
        tokenCipher: enc.cipher,
        tokenIv: enc.iv,
        tokenTag: enc.tag,
        model: input.model,
        judgeModel: input.judgeModel ?? null,
        updatedAt: new Date(),
      },
    });
}

export async function deleteAiProviderCredentials(
  organizationId: string
): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.aiProviderCredentials)
    .where(scoped(schema.aiProviderCredentials.organizationId, organizationId));
}

/** Últimos 4 caracteres del token para mostrar en UI (jamás el token). */
export function tokenLast4(token: string): string {
  return token.slice(-4);
}

/**
 * true si la organización tiene proveedor de IA — por BD (Settings) o, en su
 * ausencia, por las variables de entorno de proceso (retrocompatible).
 */
export async function isAiConfiguredFor(
  organizationId: string
): Promise<boolean> {
  const creds = await getAiProviderCredentials(organizationId);
  if (creds) return true;
  return isAiConfigured();
}
