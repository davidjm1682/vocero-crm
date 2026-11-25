/**
 * 080 — Si esta instancia puede conectar su WhatsApp a través de Zernio.
 *
 * Mismo trato que los canales opcionales (ADR-001), la agenda (ADR-002) y la
 * atribución (016): el código viaja siempre en `main` y lo que decide si EXISTE
 * para el usuario es una variable de despliegue. Una instancia que usa WhatsApp
 * directo con Meta no ve esto por ningún lado: ni opción en Ajustes, ni ruta de
 * configuración, ni una credencial que pedir.
 *
 * Qué apaga la bandera y qué no:
 *
 * - SÍ apaga la opción «Por Zernio» de Ajustes → WhatsApp y
 *   `/api/settings/whatsapp-zernio` (404, no 403).
 * - NO apaga a quien ya tiene una conexión guardada: si una instancia conectó
 *   su WhatsApp por Zernio y alguien apaga la bandera, su tráfico no se corta
 *   en silencio (el 404 de la superficie de configuración es lo único que
 *   desaparece). Quitar la conexión es una acción explícita del dueño.
 *
 * La migración se aplica siempre: una tabla vacía es inerte, y a cambio todas
 * las instancias comparten la misma estructura.
 */

/** Valores que cuentan como "encendida". Cualquier otra cosa, apagada. */
const ON_VALUES = new Set(["on", "1", "true", "si", "sí", "yes"]);

export function parseWhatsappZernioFlag(raw: string | undefined): boolean {
  return ON_VALUES.has((raw ?? "").trim().toLowerCase());
}

/**
 * Se lee de `process.env` directo, no por `getEnv()`, igual que
 * `atribucionEnabled()` y `agendaEnabled()`: preguntar si una feature existe no
 * puede depender de que TODO el entorno valide. Un entorno a medio configurar
 * debe degradar —no reventar— justo ahí.
 *
 * `WHATSAPP_ZERNIO` sí está declarada en el esquema de `lib/env.ts`: ahí viven
 * su documentación y su tipo. Lo que no pasa por el validador es esta consulta.
 */
export function whatsappZernioEnabled(): boolean {
  return parseWhatsappZernioFlag(process.env.WHATSAPP_ZERNIO);
}

/**
 * Respuesta para una superficie apagada. 404 y no 403 a propósito: si la
 * bandera está apagada, ese endpoint no existe en esta instancia — no hay nada
 * que revelar sobre él.
 */
export function whatsappZernioDisabledResponse(): Response {
  return new Response(null, { status: 404 });
}
