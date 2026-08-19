import { createHash } from "node:crypto";
import { getEnv } from "@/lib/env";
import { MetaApiError } from "@/lib/meta/client";

/**
 * Cliente de Meta Conversions API (021 — atribución de campañas de Ads).
 * Única frontera de salida hacia el Pixel/Dataset de Meta Ads. Separado de
 * `graphRequest` (ese es WhatsApp) para poder mockear cada uno sin cruzarse.
 */

function sha256(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export type ConversionEvent = {
  datasetId: string;
  accessToken: string;
  eventName: string;
  /** Segundos Unix. */
  eventTime: number;
  /** Idempotencia del lado de Meta (dedup si reintentas el mismo evento). */
  eventId: string;
  /** Teléfono en cualquier formato; se hashea antes de salir (nunca en claro). */
  phone: string | null;
  /** Click ID de Meta Ads capturado del `referral` del webhook (021). */
  ctwaClid: string | null;
};

/**
 * Manda un evento de conversión offline al Pixel/Dataset de Meta Ads.
 * `action_source: "business_messaging"` es el valor correcto para eventos
 * originados en una conversación de WhatsApp (no "website").
 */
export async function sendConversionEvent(event: ConversionEvent): Promise<void> {
  const env = getEnv();
  const url = `${env.META_ADS_GRAPH_BASE_URL}/${env.META_GRAPH_API_VERSION}/${event.datasetId}/events`;

  const userData: Record<string, unknown> = {};
  if (event.phone) userData.ph = [sha256(event.phone)];
  if (event.ctwaClid) userData.ctwa_clid = event.ctwaClid;

  const body = {
    data: [
      {
        event_name: event.eventName,
        event_time: event.eventTime,
        event_id: event.eventId,
        action_source: "business_messaging",
        messaging_channel: "whatsapp",
        user_data: userData,
      },
    ],
    access_token: event.accessToken,
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    throw new MetaApiError("No se pudo contactar Meta Conversions API", {
      status: 0,
      details: cause,
    });
  }

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // respuesta no-JSON: se conserva el texto crudo en details
  }

  if (!res.ok) {
    const err = (json as { error?: { message?: string; code?: number; type?: string } })
      ?.error;
    throw new MetaApiError(err?.message ?? `Meta respondió ${res.status}`, {
      status: res.status,
      code: err?.code ?? null,
      type: err?.type ?? null,
      details: json ?? text,
    });
  }
}
