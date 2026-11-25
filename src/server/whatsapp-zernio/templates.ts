import { MetaApiError } from "@/lib/meta/client";
import { zernioFetch } from "@/server/zernio";
import type { RemoteTemplate } from "@/server/whatsapp/templates";

/**
 * 080 · Entrega 2 — Plantillas de WhatsApp por la cuenta de Zernio del negocio.
 *
 * Según la documentación de Zernio (2026-11-25):
 * - `GET /whatsapp/templates?accountId=` lista las plantillas leídas en vivo de
 *   Meta, una por nombre + idioma, con la forma de Meta (`id`, `name`,
 *   `language`, `status`, `category`, `components`, `rejected_reason`).
 * - `POST /whatsapp/templates` crea una (`accountId`, `name`, `category`,
 *   `language`, `components`) y responde `{ template: { status, … } }`.
 * - `POST /inbox/conversations` envía una plantilla y abre (o reusa) la
 *   conversación: `participantId` = teléfono sin «+», `templateParams` en orden.
 * - `whatsapp.template.status_updated` avisa cuando Meta revisa una plantilla.
 *
 * El sandbox no permitía probar nada de esto salvo el envío: las formas de las
 * respuestas se leen con tolerancia y quedan por confirmar con un número real
 * (spec 080, «No verificado»).
 */

type Creds = { token: string; accountRef: string };

/** Las plantillas de la cuenta, en la forma de Meta que ya entiende Vocero. */
export async function listZernioTemplates(creds: Creds): Promise<RemoteTemplate[]> {
  const json = (await zernioFetch(
    `/whatsapp/templates?accountId=${encodeURIComponent(creds.accountRef)}`,
    { token: creds.token, timeoutMs: 20_000 }
  )) as unknown;
  if (Array.isArray(json)) return json as RemoteTemplate[];
  const o = (json ?? {}) as { templates?: unknown; data?: unknown };
  if (Array.isArray(o.templates)) return o.templates as RemoteTemplate[];
  if (Array.isArray(o.data)) return o.data as RemoteTemplate[];
  return [];
}

/** Crea la plantilla en la cuenta de WhatsApp y la manda a revisión de Meta. */
export async function createZernioTemplate(
  creds: Creds,
  input: {
    name: string;
    language: string;
    category: string;
    body: string;
    /** Un ejemplo por variable, ya completo y en orden. */
    examples: string[];
  }
): Promise<{ id: string | null; status: string | null }> {
  const json = (await zernioFetch("/whatsapp/templates", {
    method: "POST",
    token: creds.token,
    timeoutMs: 20_000,
    body: {
      accountId: creds.accountRef,
      name: input.name,
      language: input.language,
      category: input.category,
      components: [
        {
          type: "body",
          text: input.body,
          ...(input.examples.length > 0 ? { example: { body_text: [input.examples] } } : {}),
        },
      ],
    },
  })) as { template?: { id?: unknown; status?: unknown }; id?: unknown; status?: unknown } | null;
  const t = json?.template ?? json ?? {};
  return {
    id: t.id != null ? String(t.id) : null,
    status: typeof t.status === "string" ? t.status : null,
  };
}

/**
 * Envía una plantilla APROBADA. Abre la conversación si no existía; si ya
 * existía, Zernio la reusa. Devuelve el `wamid` y el `conversationId`, que hay
 * que guardar para poder seguir contestando en ese hilo.
 */
export async function sendZernioTemplate(
  creds: Creds,
  input: {
    phone: string;
    name: string;
    language: string;
    params: string[];
    idempotencyKey?: string;
  }
): Promise<{ messageId: string; conversationId: string | null }> {
  const participantId = input.phone.replace(/\D/g, "");
  if (!participantId) {
    throw new MetaApiError("El contacto no tiene teléfono: una plantilla por Zernio va a un número", {
      status: 400,
    });
  }
  const json = (await zernioFetch("/inbox/conversations", {
    method: "POST",
    token: creds.token,
    timeoutMs: 20_000,
    body: {
      accountId: creds.accountRef,
      participantId,
      templateName: input.name,
      templateLanguage: input.language,
      templateParams: input.params,
    },
    ...(input.idempotencyKey ? { headers: { "Idempotency-Key": input.idempotencyKey } } : {}),
  })) as { data?: { messageId?: unknown; conversationId?: unknown } } | null;
  const id = json?.data?.messageId;
  return {
    messageId: id != null ? String(id) : `zernio_${Date.now()}`,
    conversationId: json?.data?.conversationId != null ? String(json.data.conversationId) : null,
  };
}

export const ZERNIO_TEMPLATE_STATUS_EVENT = "whatsapp.template.status_updated";

export type ZernioTemplateStatus = {
  accountRef: string;
  name: string;
  language: string;
  status: "approved" | "rejected" | "pending";
  reason: string | null;
};

const ESTADO: Record<string, ZernioTemplateStatus["status"]> = {
  APPROVED: "approved",
  REJECTED: "rejected",
  // Pausada o deshabilitada: ya no se puede enviar. El CRM no tiene un estado
  // propio para eso; «rechazada» con el motivo es lo que deja de ofrecerla.
  PAUSED: "rejected",
  DISABLED: "rejected",
  PENDING: "pending",
  IN_APPEAL: "pending",
  PENDING_DELETION: "pending",
};

const texto = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

/** Puro: evento de Zernio → cambio de estado de una plantilla, o null. */
export function zernioTemplateStatus(payload: unknown): ZernioTemplateStatus | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const evt = payload as Record<string, unknown> & {
    account?: { id?: unknown; accountId?: unknown };
    template?: Record<string, unknown>;
    data?: Record<string, unknown>;
  };
  if (evt.event !== ZERNIO_TEMPLATE_STATUS_EVENT) return null;
  const t = (evt.template ?? evt.data ?? evt) as Record<string, unknown>;
  const accountRef =
    texto(evt.account?.id) ?? texto(evt.account?.accountId) ?? texto(evt.accountId) ?? texto(t.accountId);
  const name = texto(t.name) ?? texto(t.templateName);
  const language = texto(t.language) ?? texto(t.templateLanguage);
  const status = ESTADO[(texto(t.status) ?? texto(t.event) ?? "").toUpperCase()];
  if (!accountRef || !name || !language || !status) return null;
  const motivo = texto(t.reason) ?? texto(t.rejected_reason) ?? texto(t.rejectedReason);
  return {
    accountRef,
    name,
    language,
    status,
    reason: status === "approved" || motivo?.toUpperCase() === "NONE" ? null : motivo,
  };
}
