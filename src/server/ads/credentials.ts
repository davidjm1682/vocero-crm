import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { scoped } from "@/lib/db/tenant";

/**
 * Credenciales de Meta Conversions API (021). Independiente de las
 * credenciales de WhatsApp: un token con permiso `ads_management` sobre el
 * Pixel/Dataset, nunca el token de envío de mensajes.
 */

export type AdsCredentials = {
  id: string;
  organizationId: string;
  datasetId: string;
  status: "connected" | "reconnect_required";
  token: string;
};

type Row = typeof schema.metaAdsCredentials.$inferSelect;

function toCredentials(row: Row): AdsCredentials {
  return {
    id: row.id,
    organizationId: row.organizationId,
    datasetId: row.datasetId,
    status: row.status,
    token: decryptSecret({
      cipher: row.tokenCipher,
      iv: row.tokenIv,
      tag: row.tokenTag,
    }),
  };
}

export async function getAdsCredentialsByOrg(
  organizationId: string
): Promise<AdsCredentials | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.metaAdsCredentials)
    .where(scoped(schema.metaAdsCredentials.organizationId, organizationId))
    .limit(1);
  return rows[0] ? toCredentials(rows[0]) : null;
}

export async function saveAdsCredentials(input: {
  organizationId: string;
  datasetId: string;
  token: string;
}): Promise<void> {
  const db = getDb();
  const enc = encryptSecret(input.token);
  await db
    .insert(schema.metaAdsCredentials)
    .values({
      id: newId("metaAdsCredentials"),
      organizationId: input.organizationId,
      datasetId: input.datasetId,
      tokenCipher: enc.cipher,
      tokenIv: enc.iv,
      tokenTag: enc.tag,
      status: "connected",
    })
    .onConflictDoUpdate({
      target: [schema.metaAdsCredentials.organizationId],
      set: {
        datasetId: input.datasetId,
        tokenCipher: enc.cipher,
        tokenIv: enc.iv,
        tokenTag: enc.tag,
        status: "connected",
        updatedAt: new Date(),
      },
    });
}

export async function deleteAdsCredentials(
  organizationId: string
): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.metaAdsCredentials)
    .where(scoped(schema.metaAdsCredentials.organizationId, organizationId));
}

/** Marca la conexión como vencida (token inválido detectado en runtime). */
export async function markAdsReconnectRequired(
  organizationId: string
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.metaAdsCredentials)
    .set({ status: "reconnect_required", updatedAt: new Date() })
    .where(scoped(schema.metaAdsCredentials.organizationId, organizationId));
}

/** Últimos 4 caracteres del token para mostrar en UI (jamás el token). */
export function tokenLast4(token: string): string {
  return token.slice(-4);
}
