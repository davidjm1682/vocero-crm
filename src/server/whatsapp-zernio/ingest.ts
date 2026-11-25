/**
 * 080 — Entrada de los mensajes de WhatsApp que llegan por Zernio.
 *
 * T008 deja el reparto conectado; el normalizador y la ingesta real son T010.
 * Mientras tanto un evento no se pierde en silencio: queda dicho en el log.
 * (Ninguna organización puede tener esta fuente conectada hasta T022, así que
 * esto no se ejecuta con tráfico real.)
 */
export async function processZernioWhatsappEvent(_payload: unknown): Promise<void> {
  console.warn("[whatsapp-zernio] evento recibido, ingesta aún sin implementar (T010)");
}
