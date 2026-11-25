import { parseZernioEvent, type ZernioEvent } from "@/server/zernio";

/**
 * 080 · D11 — La URL `/api/webhooks/wa/<token>` recibe a Meta Y a Zernio: es la
 * del canal, y Zernio entrega por ella el WhatsApp de la organización.
 *
 * Quién es el que llama se decide por el CUERPO, que por eso se lee primero: un
 * evento de Zernio trae `account` y ningún `object`; uno de Meta trae
 * `object: "whatsapp_business_account"`. Cada uno se autentica con su propia
 * firma (`x-hub-signature-256` de la app de Meta, `X-Zernio-Signature` del
 * webhook de Zernio): nunca se acepta la de uno para el otro.
 */
export type EntregaWa =
  | { quien: "zernio"; evento: ZernioEvent }
  | { quien: "meta"; payload: unknown | null };

export function clasificarEntregaWa(rawBody: string): EntregaWa {
  const evento = parseZernioEvent(rawBody);
  if (evento && (evento as { object?: unknown }).object === undefined) {
    return { quien: "zernio", evento };
  }
  let payload: unknown | null = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    payload = null;
  }
  return { quien: "meta", payload };
}
