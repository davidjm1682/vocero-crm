import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { columnasDelSecreto, secretoDeLaFila } from "@/server/zernio/secreto-guardado";

/**
 * 080 — Credenciales del WhatsApp conectado a través de la cuenta de Zernio del
 * propio negocio (la SEGUNDA fuente del canal `whatsapp`, junto a Meta directo).
 *
 * Mismo contrato que las de los demás canales por Zernio: la llave viaja
 * descifrada solo en memoria y nunca sale en una respuesta de la API — hacia
 * fuera se expone su cola (`tokenLast4`).
 *
 * A diferencia de `tiktok/credentials.ts`, la tabla NO lleva la columna
 * `webhook_secret` en claro que la 030 dejó obsoleta. `columnasDelSecreto` y
 * `secretoDeLaFila` la siguen usando en su tipo, así que aquí se descarta al
 * escribir y se pasa en `null` al leer.
 */

export type WhatsappZernioCredentials = {
  id: string;
  organizationId: string;
  source: "zernio";
  /** `accountId` de la cuenta de WhatsApp en Zernio: por él enruta el webhook. */
  accountRef: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  webhookSecret: string | null;
  status: "connected" | "reconnect_required";
  token: string;
};

type Row = typeof schema.whatsappZernioCredentials.$inferSelect;

function toCredentials(row: Row): WhatsappZernioCredentials {
  return {
    id: row.id,
    organizationId: row.organizationId,
    source: row.source,
    accountRef: row.accountRef,
    displayPhoneNumber: row.displayPhoneNumber,
    verifiedName: row.verifiedName,
    // La columna en claro no existe en esta tabla: se pasa en null para el tipo.
    webhookSecret: secretoDeLaFila({ ...row, webhookSecret: null }),
    status: row.status,
    token: decryptSecret({
      cipher: row.tokenCipher,
      iv: row.tokenIv,
      tag: row.tokenTag,
    }),
  };
}

export async function getWhatsappZernioCredentialsByOrg(
  organizationId: string
): Promise<WhatsappZernioCredentials | null> {
  const rows = await getDb()
    .select()
    .from(schema.whatsappZernioCredentials)
    .where(eq(schema.whatsappZernioCredentials.organizationId, organizationId))
    .limit(1);
  return rows[0] ? toCredentials(rows[0]) : null;
}

/** Enrutado del webhook de Zernio: el evento trae `account.id`. */
export async function getWhatsappZernioCredentialsByAccountRef(
  accountRef: string
): Promise<WhatsappZernioCredentials | null> {
  const rows = await getDb()
    .select()
    .from(schema.whatsappZernioCredentials)
    .where(eq(schema.whatsappZernioCredentials.accountRef, accountRef))
    .limit(1);
  return rows[0] ? toCredentials(rows[0]) : null;
}

/** Las tres columnas cifradas del secreto, sin la columna en claro que no existe aquí. */
function secretoCifrado(secret: string | null) {
  const { webhookSecret: _enClaro, ...cifradas } = columnasDelSecreto(secret);
  return cifradas;
}

export async function saveWhatsappZernioCredentials(input: {
  organizationId: string;
  accountRef: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  token: string;
  webhookSecret: string | null;
}): Promise<void> {
  const db = getDb();
  const enc = encryptSecret(input.token);
  const existing = await getWhatsappZernioCredentialsByOrg(input.organizationId);

  const values = {
    organizationId: input.organizationId,
    source: "zernio" as const,
    accountRef: input.accountRef,
    displayPhoneNumber: input.displayPhoneNumber,
    verifiedName: input.verifiedName,
    tokenCipher: enc.cipher,
    tokenIv: enc.iv,
    tokenTag: enc.tag,
    ...secretoCifrado(input.webhookSecret),
    status: "connected" as const,
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(schema.whatsappZernioCredentials)
      .set(values)
      .where(eq(schema.whatsappZernioCredentials.id, existing.id));
    return;
  }
  await db
    .insert(schema.whatsappZernioCredentials)
    .values({ id: newId("credentials"), ...values });
}

/** La llave murió: se pausan los envíos y la UI pide reconectar. */
export async function markWhatsappZernioReconnectRequired(
  organizationId: string
): Promise<void> {
  await getDb()
    .update(schema.whatsappZernioCredentials)
    .set({ status: "reconnect_required", updatedAt: new Date() })
    .where(eq(schema.whatsappZernioCredentials.organizationId, organizationId));
}

/** Desconectar: borra la fila de esa organización. Acción explícita del dueño. */
export async function deleteWhatsappZernioCredentials(
  organizationId: string
): Promise<void> {
  await getDb()
    .delete(schema.whatsappZernioCredentials)
    .where(eq(schema.whatsappZernioCredentials.organizationId, organizationId));
}

export function tokenLast4(token: string): string {
  return token.slice(-4);
}
