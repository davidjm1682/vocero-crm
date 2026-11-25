import { sendZernioMessage, type ZernioSendResult } from "@/server/zernio";

/**
 * 080 — Salida de WhatsApp por la cuenta de Zernio del negocio.
 *
 * Zernio es centrado en la conversación: todo mensaje libre (dentro de la
 * ventana de 24 h) va a `POST /inbox/conversations/{conversationId}/messages`.
 * Este módulo solo arma el cuerpo y llama; traducir los fallos a `SendError`
 * es de `inbox/send.ts`, que es quien conoce ese tipo.
 *
 * Formas verificadas en el sandbox (2026-11-25): texto, texto con `reply_to`,
 * imagen y documento por URL pública, ubicación y contacto. El adjunto de un
 * archivo propio sale por `multipart/form-data` (campo `attachment`, según la
 * documentación); esa vía y `Idempotency-Key` están por confirmar en vivo.
 */

export type WhatsappZernioPayload =
  | { kind: "text"; text: string }
  | {
      kind: "media";
      file: { data: Buffer; mimeType: string; fileName?: string };
      mediaKind: "image" | "video" | "audio" | "document";
      caption?: string | null;
      /** Nota de voz: el audio debe ser Ogg/Opus mono. */
      voice?: boolean;
    }
  | {
      kind: "location";
      location: { latitude: number; longitude: number; name?: string; address?: string };
    }
  | { kind: "contacts"; contacts: { name: string; phone: string }[] };

/** Cómo llama Zernio a cada tipo de adjunto: los documentos son «file». */
const TIPO_ADJUNTO = { image: "image", video: "video", audio: "audio", document: "file" } as const;

export async function sendWhatsappViaZernio(input: {
  creds: { token: string; accountRef: string };
  /** `conversationId` opaco de Zernio, guardado en la conversación. */
  conversationId: string | null;
  payload: WhatsappZernioPayload;
  /** `wamid` del mensaje al que se responde citando. */
  replyTo?: string | null;
  idempotencyKey?: string;
}): Promise<ZernioSendResult> {
  const { payload } = input;
  const extra: Record<string, unknown> = input.replyTo ? { replyTo: input.replyTo } : {};
  let text: string | null = null;
  let attachment: { data: Buffer; mimeType: string; fileName?: string } | undefined;

  switch (payload.kind) {
    case "text":
      text = payload.text;
      break;
    case "location":
      extra.location = payload.location;
      break;
    case "contacts":
      extra.contacts = payload.contacts.map((c) => ({
        name: { formatted_name: c.name, first_name: c.name },
        phones: [{ phone: c.phone, type: "CELL" }],
      }));
      break;
    case "media":
      attachment = payload.file;
      extra.attachmentType = TIPO_ADJUNTO[payload.mediaKind];
      // El pie no aplica al audio: WhatsApp no lo admite.
      text = payload.mediaKind === "audio" ? null : (payload.caption ?? null);
      if (payload.voice && payload.mediaKind === "audio") extra.voiceNote = true;
      break;
  }

  return sendZernioMessage({
    token: input.creds.token,
    accountId: input.creds.accountRef,
    conversationId: input.conversationId,
    text,
    extra,
    attachment,
    idempotencyKey: input.idempotencyKey,
  });
}
