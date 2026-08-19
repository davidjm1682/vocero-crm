import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { sendConversionEvent } from "@/lib/meta/ads-client";
import { MetaApiError } from "@/lib/meta/client";
import { getAdsCredentialsByOrg, markAdsReconnectRequired } from "@/server/ads/credentials";

/**
 * 021 — Reporta a Meta que un lead calificó (entró a una etapa marcada
 * `reportsToMetaAds`), para que las campañas de Ads optimicen hacia leads
 * de esa calidad, no solo hacia quien contestó el primer mensaje.
 *
 * Best-effort a propósito: se llama DESPUÉS de que el movimiento de etapa ya
 * se confirmó en su propia transacción (stage-history.ts). Un fallo de Meta
 * (token vencido, timeout) jamás debe deshacer ni bloquear el movimiento del
 * lead — solo se registra en consola para diagnosticar.
 */
export async function reportQualifiedLead(input: {
  organizationId: string;
  leadId: string;
  contactId: string;
  occurredAt: Date;
}): Promise<void> {
  const creds = await getAdsCredentialsByOrg(input.organizationId);
  if (!creds || creds.status !== "connected") return; // sin conectar: no-op silencioso

  const db = getDb();
  const rows = await db
    .select({
      phone: schema.contact.phone,
      ctwaClid: schema.contact.adCtwaClid,
    })
    .from(schema.contact)
    .where(eq(schema.contact.id, input.contactId))
    .limit(1);
  const contact = rows[0];
  if (!contact) return;

  // Sin ctwa_clid Meta procesa el evento pero no lo asocia al anuncio — sigue
  // siendo útil (cuenta como conversión), así que se manda de todos modos.
  try {
    await sendConversionEvent({
      datasetId: creds.datasetId,
      accessToken: creds.token,
      eventName: "Schedule",
      eventTime: Math.floor(input.occurredAt.getTime() / 1000),
      eventId: `lead_qualified_${input.leadId}`,
      phone: contact.phone,
      ctwaClid: contact.ctwaClid,
    });
  } catch (err) {
    if (err instanceof MetaApiError && err.isAuthError) {
      await markAdsReconnectRequired(input.organizationId);
    }
    console.error(
      `[meta-ads] no se pudo reportar la conversión del lead ${input.leadId}:`,
      err
    );
  }
}
