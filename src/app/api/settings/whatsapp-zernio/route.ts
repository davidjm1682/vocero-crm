import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { puedeConectarFuente } from "@/server/whatsapp-zernio/source";
import {
  deleteWhatsappZernioCredentials,
  getWhatsappZernioCredentialsByOrg,
  saveWhatsappZernioCredentials,
  tokenLast4,
} from "@/server/whatsapp-zernio/credentials";
import {
  whatsappZernioDisabledResponse,
  whatsappZernioEnabled,
} from "@/server/whatsapp-zernio/flag";
import { ensureWebhookForOrg } from "@/server/zernio/conexiones";
import { accountHealth, zernioAccountName } from "@/server/zernio/cuentas";
import { resolveZernioAccount } from "@/server/zernio/guardar";

export const dynamic = "force-dynamic";

/**
 * 080 — Conexión del WhatsApp del negocio por SU cuenta de Zernio.
 *
 * Sin la bandera `WHATSAPP_ZERNIO` esta superficie no existe (404, ADR-001). La
 * bandera gobierna la configuración, no el tráfico: una conexión que ya está
 * guardada sigue recibiendo y enviando aunque se apague (ver `source.ts`).
 */

/** Estado de la conexión. La llave nunca sale entera: solo su cola. */
export const GET = withAuth(async (session) => {
  if (!whatsappZernioEnabled()) return whatsappZernioDisabledResponse();
  const creds = await getWhatsappZernioCredentialsByOrg(session.organizationId);
  if (!creds) return Response.json({ connection: null });
  return Response.json({
    connection: {
      source: creds.source,
      accountRef: creds.accountRef,
      displayPhoneNumber: creds.displayPhoneNumber,
      verifiedName: creds.verifiedName,
      status: creds.status,
      tokenLast4: tokenLast4(creds.token),
      hasWebhookSecret: Boolean(creds.webhookSecret),
    },
  });
});

const putSchema = z.object({
  /**
   * `accountId` de la cuenta de WhatsApp en Zernio. Opcional si la llave tiene
   * una sola cuenta de WhatsApp (023).
   */
  accountRef: z.string().trim().min(1).nullish(),
  token: z.string().trim().min(1),
  webhookSecret: z.string().trim().min(1).nullish(),
});

/**
 * Guarda la conexión validando ANTES la llave contra Zernio: una llave que no
 * sirve no llega a la base. Solo el propietario. Una organización tiene UNA
 * fuente de WhatsApp: con Meta conectado hay que desconectarlo primero (409).
 */
export const PUT = withAuth(async (session, req: Request) => {
  if (!whatsappZernioEnabled()) return whatsappZernioDisabledResponse();
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Solo el propietario puede conectar WhatsApp");
  }
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;

  const puede = await puedeConectarFuente(session.organizationId, "zernio");
  if (!puede.ok) return apiError(409, "source_conflict", puede.mensaje);

  const cuenta = await resolveZernioAccount(body.data.token, body.data.accountRef, "whatsapp");
  if (!cuenta.ok) return cuenta.response;

  const previa = await getWhatsappZernioCredentialsByOrg(session.organizationId);
  const numero = cuenta.account.username?.trim() || null;
  const nombre = cuenta.account.displayName?.trim() || null;
  await saveWhatsappZernioCredentials({
    organizationId: session.organizationId,
    accountRef: cuenta.account._id,
    displayPhoneNumber: numero,
    verifiedName: nombre,
    token: body.data.token,
    // Sin secreto nuevo se conserva el que había: reconectar no debe apagar
    // la verificación de firma.
    webhookSecret: body.data.webhookSecret ?? previa?.webhookSecret ?? null,
  });
  const webhook = await ensureWebhookForOrg(session.organizationId, {
    secret: body.data.webhookSecret,
  });

  return Response.json({
    ok: true,
    accountRef: cuenta.account._id,
    accountName: zernioAccountName(cuenta.account),
    displayPhoneNumber: numero,
    health: accountHealth(cuenta.account, "whatsapp"),
    webhook,
  });
});

/** Desconectar: acción explícita del dueño. Los mensajes ya guardados se conservan. */
export const DELETE = withAuth(async (session) => {
  if (!whatsappZernioEnabled()) return whatsappZernioDisabledResponse();
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Solo el propietario puede desconectar WhatsApp");
  }
  await deleteWhatsappZernioCredentials(session.organizationId);
  return Response.json({ ok: true });
});
