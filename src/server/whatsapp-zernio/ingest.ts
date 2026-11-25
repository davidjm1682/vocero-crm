import { BSUID_PREFIX, type ResolvedIdentity } from "@/server/inbox/identity";
import { ingestInboundMessage, type MediaInput } from "@/server/inbox/ingest";
import { ingerirPartes } from "@/server/inbox/partes";
import { splitInbound, type RemoteAttachment } from "@/server/inbox/remote-media";
import { zernioSentAtSeconds, type ZernioEvent } from "@/server/zernio";
import { getWhatsappZernioCredentialsByAccountRef } from "@/server/whatsapp-zernio/credentials";
import { processZernioWhatsappStatus } from "@/server/whatsapp-zernio/status";
import { applyZernioTemplateEvent } from "@/server/whatsapp/templates";
import { normalizeMx } from "@/lib/meta/client";

/**
 * 080 — Entrada de los mensajes de WhatsApp que llegan por Zernio.
 *
 * Misma idea que `tiktok/ingest.ts`: un normalizador PURO (qué se ingiere y qué
 * se descarta es lo que primero se rompe cuando el proveedor cambia un campo) y
 * un procesador que lo mete por el MISMO núcleo de ingesta que Meta: contacto,
 * conversación, idempotencia, bus de eventos y turno del agente.
 *
 * Las formas salen de los eventos reales del sandbox (2026-11-25); ver
 * `tests/unit/whatsapp-zernio-ingest.test.ts`.
 */

/** Lo que `ZernioEvent` no declara y WhatsApp sí manda. */
type WaZernioEvent = ZernioEvent & {
  message?: ZernioEvent["message"] & {
    attachments?: RemoteAttachment[];
    sender?: {
      id?: string;
      name?: string | null;
      username?: string | null;
      phoneNumber?: string | null;
      businessScopedUserId?: string | null;
    };
  };
  metadata?: {
    buttonPayload?: string | null;
    quotedMessageId?: string | null;
    quotedMessage?: { messageId?: string; platformMessageId?: string } | null;
    location?: { latitude?: unknown; longitude?: unknown; name?: unknown; address?: unknown } | null;
    contacts?: unknown[] | null;
  } | null;
};

export type WhatsappZernioInbound = {
  /** `account.id` de Zernio: la llave de enrutado a la organización. */
  accountRef: string;
  /** Teléfono sin «+», como el `from` de Meta: así es la MISMA identidad. */
  phone: string | null;
  /** BSUID (`businessScopedUserId`). */
  waUserId: string | null;
  profileName: string | null;
  /** El `wamid`: el mismo id que usan los acuses y las citas. */
  messageId: string;
  /** text | image | video | audio | document | sticker | location | contacts */
  type: string;
  text: string | null;
  /** Segundos desde epoch. */
  timestamp: string;
  /** `conversationId` opaco de Zernio. */
  threadRef: string | null;
  /** `wamid` del mensaje que el cliente citó. */
  replyTo: string | null;
  attachments: RemoteAttachment[];
  location: { latitude: number; longitude: number; name?: string; address?: string } | null;
  contacts: unknown[] | null;
};

const ATTACHMENT_TYPE: Record<string, string> = {
  image: "image",
  video: "video",
  audio: "audio",
  file: "document",
  document: "document",
  sticker: "sticker",
};

const texto = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

/**
 * Evento de Zernio → mensaje entrante de WhatsApp, o nada. El MISMO webhook
 * trae las demás plataformas de esa llave, y los acuses de envío: nada de eso
 * es algo que el cliente dijo.
 */
export function normalizeZernioWhatsappEvent(payload: unknown): WhatsappZernioInbound[] {
  const evt = payload as WaZernioEvent | null;
  if (!evt || typeof evt !== "object" || Array.isArray(evt)) return [];
  if ((evt.account?.platform ?? evt.message?.platform ?? "").toLowerCase() !== "whatsapp") return [];
  if (evt.event !== "message.received") return [];
  if (evt.message?.direction && evt.message.direction !== "incoming") return [];

  const accountRef = evt.account?.id ?? evt.account?.accountId;
  const messageId = evt.message?.platformMessageId ?? evt.message?.id;
  if (!accountRef || !messageId) return [];

  // Identidad (D3): el teléfono de `sender.id`, sin «+». El teléfono que trae
  // una tarjeta de contacto compartida NO se usa: es de otra persona (T013).
  const sender = evt.message?.sender;
  const digitos = (sender?.id ?? "").replace(/\D/g, "");
  const phone = digitos ? normalizeMx(digitos) : null;
  const waUserId = texto(sender?.businessScopedUserId);
  if (!phone && !waUserId) return [];

  const meta = evt.metadata ?? {};
  const attachments = Array.isArray(evt.message?.attachments) ? evt.message.attachments : [];

  const lat = meta.location?.latitude;
  const lon = meta.location?.longitude;
  const location =
    typeof lat === "number" && typeof lon === "number"
      ? {
          latitude: lat,
          longitude: lon,
          ...(texto(meta.location?.name) ? { name: texto(meta.location?.name)! } : {}),
          ...(texto(meta.location?.address) ? { address: texto(meta.location?.address)! } : {}),
        }
      : null;
  const contacts = Array.isArray(meta.contacts) && meta.contacts.length > 0 ? meta.contacts : null;

  let type: string;
  let text: string | null;
  if (location) {
    // El texto («📍 Location») es solo un resumen de Zernio.
    type = "location";
    text = null;
  } else if (contacts) {
    type = "contacts";
    text = null;
  } else {
    // Botón de plantilla: el rótulo que tocó el cliente; sin él, el payload.
    text = texto(evt.message?.text) ?? texto(meta.buttonPayload);
    const adjunto = attachments[0];
    type = text
      ? "text"
      : adjunto
        ? (ATTACHMENT_TYPE[(adjunto.type ?? "").toLowerCase()] ?? "unsupported")
        : "";
    if (!type) return []; // ni texto ni adjunto: no hay nada que ingerir
  }

  return [
    {
      accountRef,
      phone,
      waUserId,
      profileName: texto(sender?.name),
      messageId,
      type,
      text,
      timestamp: zernioSentAtSeconds(evt.message?.sentAt),
      threadRef: evt.message?.conversationId ?? evt.conversation?.id ?? null,
      replyTo:
        texto(meta.quotedMessage?.platformMessageId) ?? texto(meta.quotedMessageId) ?? null,
      attachments,
      location,
      contacts,
    },
  ];
}

/** La identidad del contacto: la misma que la de Meta (teléfono; si no, BSUID). */
function identidadDe(m: WhatsappZernioInbound): ResolvedIdentity {
  return m.phone
    ? { identity: m.phone, phone: m.phone, waUserId: m.waUserId, profileName: m.profileName }
    : {
        identity: `${BSUID_PREFIX}${m.waUserId}`,
        phone: null,
        waUserId: m.waUserId,
        profileName: m.profileName,
      };
}

const sinArchivo = (kind: "location" | "contacts", payload: unknown): MediaInput => ({
  kind,
  waMediaId: null,
  mimeType: null,
  fileName: null,
  caption: null,
  payload,
  fetchStatus: "available",
});

/** Jamás lanza hacia el webhook: un evento malo no tumba las entregas buenas. */
export async function processZernioWhatsappEvent(payload: unknown): Promise<void> {
  // Entrega 2: Meta revisó una plantilla de la cuenta.
  const evento = (payload as { event?: unknown } | null)?.event;
  if (typeof evento === "string" && evento.startsWith("whatsapp.template.")) {
    await applyZernioTemplateEvent(payload);
    return;
  }
  // Los acuses de envío (message.sent|delivered|read|failed) tienen su camino.
  if (typeof (payload as { event?: unknown } | null)?.event === "string" &&
      (payload as { event: string }).event !== "message.received") {
    await processZernioWhatsappStatus(payload);
    return;
  }
  for (const m of normalizeZernioWhatsappEvent(payload)) {
    const creds = await getWhatsappZernioCredentialsByAccountRef(m.accountRef);
    if (!creds) {
      console.warn(
        `[whatsapp-zernio] evento para una cuenta desconocida (${m.accountRef}): ` +
          "conecta el WhatsApp por Zernio en Configuración → WhatsApp para recibir mensajes"
      );
      continue;
    }

    const base = {
      organizationId: creds.organizationId,
      identity: identidadDe(m),
      timestamp: m.timestamp,
      threadRef: m.threadRef,
      replyToWaMessageId: m.replyTo,
    };

    if (m.type === "location" || m.type === "contacts") {
      await ingestInboundMessage({
        ...base,
        waMessageId: m.messageId,
        type: m.type,
        text: null,
        media: sinArchivo(m.type, m.type === "location" ? m.location : m.contacts),
      });
      continue;
    }

    // Un mensaje por texto y uno por adjunto; solo el último despierta al cerebro.
    const partes = splitInbound(m.text, m.attachments, "zernio-whatsapp");
    if (partes.length === 0) continue;
    await ingerirPartes(base, m.messageId, partes);
  }
}
