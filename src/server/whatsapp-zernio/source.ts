import { getCredentialsByOrg } from "@/server/whatsapp/credentials";
import { getWhatsappZernioCredentialsByOrg } from "@/server/whatsapp-zernio/credentials";

/**
 * 080 · D1 — De dónde saca esta organización su WhatsApp: de Meta directo o de
 * la cuenta de Zernio del propio negocio. UNA a la vez.
 *
 * Se decide aquí, en un solo lugar y en código, y no con una restricción
 * cruzada entre tablas: así `meta_credentials` sigue intacta y las instancias
 * que ya funcionan con Meta no corren ningún riesgo.
 *
 * La bandera `WHATSAPP_ZERNIO` NO interviene en esta decisión. Gobierna la
 * superficie de configuración (conectar, cambiar la llave), no el tráfico: si
 * alguien apaga la bandera de una instancia que ya tiene su WhatsApp por
 * Zernio, los mensajes de sus clientes no se pierden en silencio. Quitar la
 * conexión es una acción explícita del dueño (Principio II.3: el conector
 * nunca bloquea ni pierde la operación core).
 */

export type WhatsappSource = "meta" | "zernio";

/**
 * `null` si la organización no tiene WhatsApp conectado por ninguna fuente. Si
 * por un descuido hubiera las dos, gana Meta: es lo que ya funcionaba antes de
 * que existiera la otra.
 */
export async function getWhatsappSource(
  organizationId: string
): Promise<WhatsappSource | null> {
  if (await getCredentialsByOrg(organizationId)) return "meta";
  if (await getWhatsappZernioCredentialsByOrg(organizationId)) return "zernio";
  return null;
}

export type PuedeConectar =
  | { ok: true }
  | { ok: false; actual: WhatsappSource; mensaje: string };

const NOMBRE: Record<WhatsappSource, string> = {
  meta: "Meta",
  zernio: "Zernio",
};

/**
 * ¿Se puede guardar una conexión de esta fuente? Sí si la organización no tiene
 * ninguna o si ya tiene esa misma (cambiar la llave o reconectar). No si tiene
 * la OTRA: hay que desconectarla primero, a propósito, para que nadie cambie de
 * fuente por accidente y se quede sin saber por dónde le llegan los mensajes.
 */
export async function puedeConectarFuente(
  organizationId: string,
  fuente: WhatsappSource
): Promise<PuedeConectar> {
  const actual = await getWhatsappSource(organizationId);
  if (actual === null || actual === fuente) return { ok: true };
  return {
    ok: false,
    actual,
    mensaje:
      `Este WhatsApp ya está conectado por ${NOMBRE[actual]}. ` +
      `Desconéctalo antes de conectarlo por ${NOMBRE[fuente]}.`,
  };
}
