import { applyStatusUpdate } from "@/server/inbox/status";
import type { WebhookStatus } from "@/server/inbox/webhook";
import { getWhatsappZernioCredentialsByAccountRef } from "@/server/whatsapp-zernio/credentials";
import { zernioSentAtSeconds } from "@/server/zernio";
import { ZERNIO_WHATSAPP_STATUS_EVENTS } from "@/server/zernio/webhooks";

/**
 * 080 — Los acuses de envío de WhatsApp por Zernio.
 *
 * Meta los manda como `statuses[]` dentro del POST de mensajes; Zernio los
 * manda como eventos aparte (`message.sent|delivered|read|failed`). Aquí se
 * convierten a la forma de Meta y entran por el MISMO `applyStatusUpdate`, que
 * ya no degrada un estado: los eventos llegan fuera de orden (1–15 s de
 * latencia, sin orden garantizado) y un `delivered` tardío no debe pisar un
 * `read`.
 *
 * El id es el `wamid` (`platformMessageId`): el mismo que devuelve el envío y
 * que se guardó como `waMessageId`.
 */

const ESTADO: Record<(typeof ZERNIO_WHATSAPP_STATUS_EVENTS)[number], string> = {
  "message.sent": "sent",
  "message.delivered": "delivered",
  "message.read": "read",
  "message.failed": "failed",
};

type Evento = {
  event?: string;
  message?: {
    id?: string;
    platform?: string;
    platformMessageId?: string;
    statusAt?: string;
    sentAt?: string;
    error?: unknown;
    errors?: unknown;
  };
  account?: { platform?: string };
  error?: unknown;
  errors?: unknown;
};

type ErrorZernio = { code?: unknown; message?: unknown; title?: unknown };

/** `failed` aún no se observó en el sandbox: se lee el motivo donde pueda venir. */
function errorDe(evt: Evento): WebhookStatus["errors"] {
  const candidatos = [evt.error, evt.errors, evt.message?.error, evt.message?.errors]
    .flat()
    .filter((e): e is ErrorZernio => !!e && typeof e === "object");
  const e = candidatos[0];
  if (!e) return undefined;
  const code = Number(e.code);
  const message =
    typeof e.message === "string" && e.message.trim()
      ? e.message
      : typeof e.title === "string"
        ? e.title
        : undefined;
  return [{ code: Number.isFinite(code) ? code : (undefined as unknown as number), message }];
}

/** Evento de Zernio → estado en la forma de Meta, o null si no es un acuse. */
export function zernioEventToStatus(payload: unknown): WebhookStatus | null {
  const evt = payload as Evento | null;
  if (!evt || typeof evt !== "object" || Array.isArray(evt)) return null;
  const estado = ESTADO[evt.event as keyof typeof ESTADO];
  if (!estado) return null;
  if ((evt.account?.platform ?? evt.message?.platform ?? "").toLowerCase() !== "whatsapp") return null;

  const id = evt.message?.platformMessageId ?? evt.message?.id;
  if (!id) return null;

  const errors = estado === "failed" ? errorDe(evt) : undefined;
  return {
    id,
    status: estado,
    timestamp: zernioSentAtSeconds(evt.message?.statusAt ?? evt.message?.sentAt),
    ...(errors ? { errors } : {}),
  };
}

/** Jamás lanza hacia el webhook. */
export async function processZernioWhatsappStatus(payload: unknown): Promise<void> {
  const status = zernioEventToStatus(payload);
  if (!status) return;
  const accountRef =
    (payload as { account?: { id?: string; accountId?: string } }).account?.id ??
    (payload as { account?: { accountId?: string } }).account?.accountId;
  if (!accountRef) return;
  const creds = await getWhatsappZernioCredentialsByAccountRef(accountRef);
  if (!creds) {
    console.warn(`[whatsapp-zernio] acuse para una cuenta desconocida (${accountRef}): ignorado`);
    return;
  }
  try {
    await applyStatusUpdate(creds.organizationId, status);
  } catch (err) {
    console.error(`[whatsapp-zernio] no se pudo aplicar el acuse de ${status.id}:`, err);
  }
}
