import { mockGuard } from "@/lib/dev-guard";
import {
  nextZernioMessageId,
  resetZernioMock,
  zernioMockState,
  zernioTokenIsBad,
  type ZernioMockAccount,
  type ZernioMockTemplate,
  type ZernioMockWebhook,
} from "@/server/dev/zernio-mock-state";

export const dynamic = "force-dynamic";

/**
 * 017 — Zernio de mentira para el self-test. Tras `mockGuard()`: 404
 * incondicional en producción, indistinguible de una ruta inexistente.
 *
 * Imita lo único que Vocero usa de esa API —listar conversaciones, responder
 * en una y, desde la 023, las cuentas y los webhooks— y expone `_sent`,
 * `_state`, `_accounts`, `_webhooks`, `_down` y `_reset` para que el arnés
 * prepare el escenario y afirme sobre lo que pasó.
 */

type Ctx = { params: Promise<{ path: string[] }> };

function unauthorized(): Response {
  return Response.json(
    { error: { message: "Invalid API key" } },
    { status: 401 }
  );
}

function unavailable(): Response {
  return Response.json({ error: { message: "Service unavailable" } }, { status: 503 });
}

/** Aplica al webhook solo los campos que llegaron, como hace la API real. */
function webhookFrom(
  body: Record<string, unknown>,
  base: ZernioMockWebhook
): ZernioMockWebhook {
  return {
    ...base,
    ...(typeof body.name === "string" ? { name: body.name } : {}),
    ...(typeof body.url === "string" ? { url: body.url } : {}),
    ...(typeof body.secret === "string" ? { secret: body.secret } : {}),
    ...(Array.isArray(body.events) ? { events: body.events.map(String) } : {}),
    ...(typeof body.isActive === "boolean" ? { isActive: body.isActive } : {}),
    ...(Array.isArray(body.accountIds) ? { accountIds: body.accountIds.map(String) } : {}),
  };
}

export async function GET(req: Request, ctx: Ctx) {
  const denied = mockGuard();
  if (denied) return denied;
  const { path } = await ctx.params;
  const route = path.join("/");

  const state = zernioMockState();
  if (route === "_sent") {
    return Response.json({
      sent: state.sent,
      reactions: state.reactions,
      sentTemplates: state.sentTemplates,
      templates: state.templates,
    });
  }
  if (route === "_state") {
    return Response.json({
      accounts: state.accounts,
      webhooks: state.webhooks,
      hits: state.hits,
    });
  }
  if (zernioTokenIsBad(req.headers.get("authorization"))) return unauthorized();
  state.hits[route] = (state.hits[route] ?? 0) + 1;
  if (state.down.includes(route)) return unavailable();

  // 023 — GET /accounts: valida la llave y dice qué cuentas tiene.
  if (route === "accounts") {
    return Response.json({ accounts: state.accounts, hasAnalyticsAccess: false });
  }
  // 023 — GET /webhooks/settings: los webhooks de la llave, con su secreto.
  if (route === "webhooks/settings") {
    return Response.json({ webhooks: state.webhooks });
  }

  // 080 · Entrega 2 — GET /whatsapp/templates?accountId=: las de esa cuenta.
  if (route === "whatsapp/templates") {
    const accountId = new URL(req.url).searchParams.get("accountId");
    return Response.json({
      templates: state.templates.filter((t) => t.accountId === accountId),
    });
  }

  // 080 — El adjunto de un mensaje de WhatsApp: como el real, responde 401 sin
  // la llave de Zernio (la comprobación de arriba) y bytes con ella.
  if (route.startsWith("whatsapp/media/")) {
    const id = route.slice("whatsapp/media/".length);
    return new Response(Buffer.from(`ARCHIVO-DE-PRUEBA-${id}`), {
      headers: { "content-type": "image/jpeg" },
    });
  }

  // GET /inbox/conversations → lo que usa la validación de la llave.
  if (route === "inbox/conversations") {
    return Response.json({ data: [], hasMore: false });
  }
  return Response.json({});
}

export async function POST(req: Request, ctx: Ctx) {
  const denied = mockGuard();
  if (denied) return denied;
  const { path } = await ctx.params;

  const route = path.join("/");
  if (route === "_reset") {
    resetZernioMock();
    return Response.json({ ok: true });
  }
  // 023 — preparar el escenario desde el arnés.
  // 080 · Entrega 2 — el arnés decide la revisión de Meta: `_templates` reemplaza
  // las plantillas (para aprobar o rechazar una ya creada).
  if (route === "_templates") {
    const body = (await req.json().catch(() => ({}))) as { templates?: ZernioMockTemplate[] };
    zernioMockState().templates = body.templates ?? [];
    return Response.json({ ok: true });
  }
  if (route === "_dead") {
    const body = (await req.json().catch(() => ({}))) as { dead?: boolean };
    zernioMockState().dead = body.dead !== false;
    return Response.json({ ok: true });
  }
  if (route === "_accounts" || route === "_webhooks" || route === "_down") {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const state = zernioMockState();
    if (route === "_accounts") {
      state.accounts = (body.accounts as ZernioMockAccount[] | undefined) ?? [];
    } else if (route === "_webhooks") {
      state.webhooks = (body.webhooks as ZernioMockWebhook[] | undefined) ?? [];
    } else {
      state.down = (body.routes as string[] | undefined) ?? [];
    }
    return Response.json({ ok: true });
  }
  if (zernioTokenIsBad(req.headers.get("authorization"))) return unauthorized();
  if (zernioMockState().down.includes(route)) return unavailable();

  // 080 · Entrega 2 — POST /whatsapp/templates: crear; queda en revisión.
  if (route === "whatsapp/templates") {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const state = zernioMockState();
    const comps = (body.components as { type?: string; text?: string }[] | undefined) ?? [];
    const plantilla: ZernioMockTemplate = {
      id: `tplmock_${Date.now().toString(36)}_${++state.seq}`,
      accountId: String(body.accountId ?? ""),
      name: String(body.name ?? ""),
      language: String(body.language ?? ""),
      category: String(body.category ?? ""),
      status: "PENDING",
      components: comps.map((c) => ({ type: String(c.type ?? "").toUpperCase(), text: c.text })),
    };
    state.templates = [
      ...state.templates.filter(
        (t) => !(t.accountId === plantilla.accountId && t.name === plantilla.name && t.language === plantilla.language)
      ),
      plantilla,
    ];
    return Response.json({ success: true, template: { id: plantilla.id, status: plantilla.status } });
  }

  // 080 · Entrega 2 — POST /inbox/conversations con plantilla: abre o reusa.
  if (route === "inbox/conversations") {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const state = zernioMockState();
    const aprobada = state.templates.find(
      (t) =>
        t.accountId === String(body.accountId ?? "") &&
        t.name === body.templateName &&
        t.language === body.templateLanguage &&
        t.status === "APPROVED"
    );
    if (!aprobada) {
      return Response.json(
        { error: { message: "Template is not approved", code: 132001 } },
        { status: 400 }
      );
    }
    const messageId = nextZernioMessageId();
    const participantId = String(body.participantId ?? "");
    const conversationId = `zconv_tpl_${participantId}`;
    state.sentTemplates.push({
      messageId,
      conversationId,
      accountId: body.accountId ? String(body.accountId) : null,
      participantId,
      templateName: String(body.templateName ?? ""),
      templateLanguage: String(body.templateLanguage ?? ""),
      templateParams: Array.isArray(body.templateParams) ? body.templateParams.map(String) : [],
      idempotencyKey: req.headers.get("idempotency-key"),
    });
    return Response.json(
      { success: true, data: { messageId, conversationId, participantId } },
      { status: 201 }
    );
  }

  // 023 — POST /webhooks/settings: crear.
  if (route === "webhooks/settings") {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const state = zernioMockState();
    const webhook = webhookFrom(body, {
      _id: `whmock_${Date.now().toString(36)}_${++state.seq}`,
      name: "",
      url: "",
      secret: null,
      events: [],
      isActive: true,
      accountIds: [],
      failureCount: 0,
      lastFiredAt: null,
    });
    state.webhooks.push(webhook);
    return Response.json({ success: true, webhook });
  }

  // 072 — POST /inbox/conversations/{id}/messages/{messageId}/reactions
  if (esRutaDeReaccion(path)) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return registrarReaccion(path, body.accountId ? String(body.accountId) : null, String(body.emoji ?? ""));
  }

  // POST /inbox/conversations/{id}/messages
  if (
    path.length === 4 &&
    path[0] === "inbox" &&
    path[1] === "conversations" &&
    path[3] === "messages"
  ) {
    // 080: el cuerpo llega como JSON o, con un archivo propio, como multipart.
    const esMultipart = (req.headers.get("content-type") ?? "").startsWith("multipart/form-data");
    let body: Record<string, unknown> = {};
    let attachment: { name: string; type: string; size: number } | undefined;
    if (esMultipart) {
      const form = await req.formData().catch(() => null);
      for (const [k, v] of form?.entries() ?? []) {
        if (typeof v === "string") body[k] = v;
        else attachment = { name: v.name, type: v.type, size: v.size };
      }
      for (const k of ["location", "contacts"]) {
        if (typeof body[k] === "string") body[k] = JSON.parse(body[k] as string);
      }
      if (body.voiceNote !== undefined) body.voiceNote = body.voiceNote === "true";
    } else {
      body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    }
    const state = zernioMockState();
    const id = nextZernioMessageId();
    state.sent.push({
      n: state.seq,
      messageId: id,
      conversationId: decodeURIComponent(path[2]!),
      accountId: body.accountId ? String(body.accountId) : null,
      message: String(body.message ?? ""),
      ...(body.messagingType ? { messagingType: String(body.messagingType) } : {}),
      ...(body.messageTag ? { messageTag: String(body.messageTag) } : {}),
      ...(body.replyTo ? { replyTo: String(body.replyTo) } : {}),
      ...(body.location ? { location: body.location } : {}),
      ...(body.contacts ? { contacts: body.contacts } : {}),
      ...(body.attachmentType ? { attachmentType: String(body.attachmentType) } : {}),
      ...(body.voiceNote !== undefined ? { voiceNote: body.voiceNote === true } : {}),
      ...(attachment ? { attachment } : {}),
      via: esMultipart ? "multipart" : "json",
      idempotencyKey: req.headers.get("idempotency-key"),
      at: new Date().toISOString(),
    });
    // `data.messageId` es la forma real; `message.id` la que leían los demás canales.
    return Response.json({ success: true, data: { messageId: id }, message: { id } });
  }

  return Response.json({});
}

/** 023 — PUT /webhooks/settings: actualizar el webhook `webhookId`. */
export async function PUT(req: Request, ctx: Ctx) {
  const denied = mockGuard();
  if (denied) return denied;
  const { path } = await ctx.params;
  if (zernioTokenIsBad(req.headers.get("authorization"))) return unauthorized();
  const route = path.join("/");
  const state = zernioMockState();
  if (state.down.includes(route)) return unavailable();

  if (route === "webhooks/settings") {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const i = state.webhooks.findIndex((w) => w._id === body.webhookId);
    if (i < 0) {
      return Response.json({ error: { message: "Webhook not found" } }, { status: 404 });
    }
    const webhook = webhookFrom(body, state.webhooks[i]!);
    state.webhooks[i] = webhook;
    return Response.json({ success: true, webhook });
  }
  return Response.json({});
}

/** 072 — DELETE /inbox/conversations/{id}/messages/{messageId}/reactions?accountId= */
export async function DELETE(req: Request, ctx: Ctx) {
  const denied = mockGuard();
  if (denied) return denied;
  const { path } = await ctx.params;
  if (zernioTokenIsBad(req.headers.get("authorization"))) return unauthorized();
  if (!esRutaDeReaccion(path)) return Response.json({});
  return registrarReaccion(path, new URL(req.url).searchParams.get("accountId"), "");
}

function esRutaDeReaccion(path: string[]): boolean {
  return (
    path.length === 6 &&
    path[0] === "inbox" &&
    path[1] === "conversations" &&
    path[3] === "messages" &&
    path[5] === "reactions"
  );
}

/** Un `messageId` que empieza con `no-existe` contesta 404 como la API real. */
function registrarReaccion(path: string[], accountId: string | null, emoji: string): Response {
  const messageId = decodeURIComponent(path[4]!);
  if (messageId.startsWith("no-existe")) {
    return Response.json({ error: "Message not found", code: "message_not_found" }, { status: 404 });
  }
  zernioMockState().reactions.push({
    conversationId: decodeURIComponent(path[2]!),
    messageId,
    accountId,
    emoji,
    at: new Date().toISOString(),
  });
  return Response.json({ success: true, messageId, platformMessageId: `pm_${messageId}` });
}
