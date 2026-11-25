import { getEnv } from "@/lib/env";
import { isValidSignature, isValidWebhookToken } from "@/server/inbox/webhook";
import { recibirEvento } from "@/server/webhooks/recibir";
import { zernioSignatureFrom } from "@/server/zernio";
import { isAuthenticZernioDelivery } from "@/server/zernio/dispatch";
import { clasificarEntregaWa } from "@/server/whatsapp-zernio/entrega";

/**
 * Webhook público de WhatsApp (contrato webhook.md).
 * Capa 1: el segmento [webhookToken] debe coincidir (si no → 404 sin efectos).
 * Capa 2: firma x-hub-signature-256 solo si META_APP_SECRET está configurado.
 * 047: tras validar, el evento se guarda ANTES de responder 200 y se procesa
 * fuera de la ruta; si falla, el barrido lo reintenta. Si no se pudo guardar,
 * 503 para que Meta reintente (`src/server/webhooks/recibir.ts`).
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ webhookToken: string }> };

export async function GET(req: Request, { params }: Params) {
  const { webhookToken } = await params;
  const env = getEnv();
  if (!isValidWebhookToken(webhookToken, env.META_WEBHOOK_VERIFY_TOKEN)) {
    return new Response(null, { status: 404 });
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === env.META_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response(null, { status: 403 });
}

export async function POST(req: Request, { params }: Params) {
  const { webhookToken } = await params;
  const env = getEnv();
  if (!isValidWebhookToken(webhookToken, env.META_WEBHOOK_VERIFY_TOKEN)) {
    return new Response(null, { status: 404 });
  }

  // 080: esta URL la usan Meta y, para el WhatsApp por Zernio, Zernio. Se lee
  // el cuerpo primero para saber quién llama y validar SU firma.
  const rawBody = await req.text();
  const entrega = clasificarEntregaWa(rawBody);

  if (entrega.quien === "zernio") {
    // Misma capa que las rutas de Instagram, Messenger y TikTok (023).
    if (!(await isAuthenticZernioDelivery(rawBody, zernioSignatureFrom(req.headers)))) {
      return new Response(null, { status: 401 });
    }
    return recibirEvento("zernio", entrega.evento, rawBody, "wa");
  }

  const signature = req.headers.get("x-hub-signature-256");
  if (!isValidSignature(rawBody, signature, env.META_APP_SECRET)) {
    return new Response(null, { status: 401 });
  }

  if (entrega.payload === null) {
    // body ilegible: 200 igualmente (Meta reintenta y termina desactivando)
    return Response.json({ received: true });
  }

  return recibirEvento("whatsapp", entrega.payload, rawBody, "webhook");
}
