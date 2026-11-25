import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createZernioTemplate,
  listZernioTemplates,
  sendZernioTemplate,
  zernioTemplateStatus,
} from "@/server/whatsapp-zernio/templates";
import { zernioTargetChannel } from "@/server/zernio/dispatch";
import {
  ZERNIO_WHATSAPP_TEMPLATE_EVENTS,
  zernioWebhookEvents,
} from "@/server/zernio/webhooks";
import { whatsappCapabilities, whatsappWindowClosedMessage } from "@/server/channels/capabilities";
import { MetaApiError } from "@/lib/meta/client";

const CREDS = { token: "sk_test_abc", accountRef: "6b00000000000000000000a1" };

type Llamada = { url: string; init: RequestInit };
let llamadas: Llamada[];

function responder(status: number, json: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      llamadas.push({ url, init });
      return new Response(JSON.stringify(json), { status });
    })
  );
}
const cuerpo = (i = 0) => JSON.parse(String(llamadas[i]!.init.body)) as Record<string, unknown>;

beforeEach(() => {
  llamadas = [];
});
afterEach(() => vi.unstubAllGlobals());

describe("080 · entrega 2 · listar plantillas por Zernio (T029/T030)", () => {
  const remota = {
    id: "111",
    name: "confirmacion_cita",
    language: "es",
    status: "APPROVED",
    category: "UTILITY",
    components: [{ type: "BODY", text: "Hola {{1}}, tu cita es el {{2}}." }],
  };

  it("pide la lista de la cuenta con la llave, y lee `templates`", async () => {
    responder(200, { templates: [remota] });
    const r = await listZernioTemplates(CREDS);
    expect(r).toEqual([remota]);
    expect(llamadas[0]!.url).toMatch(/\/whatsapp\/templates\?accountId=6b00000000000000000000a1$/);
    expect((llamadas[0]!.init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk_test_abc"
    );
  });

  it("también acepta `data` o un arreglo directo (la forma exacta está por confirmar)", async () => {
    responder(200, { data: [remota] });
    expect(await listZernioTemplates(CREDS)).toHaveLength(1);
    llamadas = [];
    responder(200, [remota]);
    expect(await listZernioTemplates(CREDS)).toHaveLength(1);
    llamadas = [];
    responder(200, { nada: true });
    expect(await listZernioTemplates(CREDS)).toEqual([]);
  });

  it("una llave muerta sale como error de autenticación", async () => {
    responder(401, { error: "Invalid API key" });
    const err = await listZernioTemplates(CREDS).catch((e) => e);
    expect(err).toBeInstanceOf(MetaApiError);
    expect(err.isAuthError).toBe(true);
  });
});

describe("080 · entrega 2 · crear plantilla por Zernio", () => {
  it("manda nombre, idioma, categoría y el cuerpo con un ejemplo por variable", async () => {
    responder(200, { template: { id: "222", status: "PENDING" } });
    const r = await createZernioTemplate(CREDS, {
      name: "recordatorio",
      language: "es",
      category: "UTILITY",
      body: "Hola {{1}}, te esperamos el {{2}}.",
      examples: ["Ana", "martes 14"],
    });
    expect(r).toEqual({ id: "222", status: "PENDING" });
    expect(llamadas[0]!.url).toMatch(/\/whatsapp\/templates$/);
    expect(llamadas[0]!.init.method).toBe("POST");
    expect(cuerpo()).toEqual({
      accountId: CREDS.accountRef,
      name: "recordatorio",
      language: "es",
      category: "UTILITY",
      components: [
        {
          type: "body",
          text: "Hola {{1}}, te esperamos el {{2}}.",
          example: { body_text: [["Ana", "martes 14"]] },
        },
      ],
    });
  });

  it("sin variables no manda ejemplo", async () => {
    responder(200, { template: { id: "333", status: "PENDING" } });
    await createZernioTemplate(CREDS, {
      name: "saludo",
      language: "es",
      category: "MARKETING",
      body: "Hola, gracias por escribirnos.",
      examples: [],
    });
    expect((cuerpo().components as unknown[])[0]).toEqual({
      type: "body",
      text: "Hola, gracias por escribirnos.",
    });
  });

  it("una respuesta sin id no rompe: el id queda nulo y la sincronización lo completa", async () => {
    responder(200, { success: true });
    const r = await createZernioTemplate(CREDS, {
      name: "x",
      language: "es",
      category: "UTILITY",
      body: "Hola.",
      examples: [],
    });
    expect(r).toEqual({ id: null, status: null });
  });
});

describe("080 · entrega 2 · enviar plantilla por Zernio (T032)", () => {
  it("abre o reusa la conversación con el teléfono sin «+» y los valores en orden", async () => {
    responder(201, {
      success: true,
      data: { messageId: "wamid.TPL1", conversationId: "conv_9", participantId: "56900000000" },
    });
    const r = await sendZernioTemplate(CREDS, {
      phone: "+56 9 0000 0000",
      name: "recordatorio",
      language: "es",
      params: ["Ana", "martes 14"],
      idempotencyKey: "envio-1",
    });
    expect(r).toEqual({ messageId: "wamid.TPL1", conversationId: "conv_9" });
    expect(llamadas[0]!.url).toMatch(/\/inbox\/conversations$/);
    expect(cuerpo()).toEqual({
      accountId: CREDS.accountRef,
      participantId: "56900000000",
      templateName: "recordatorio",
      templateLanguage: "es",
      templateParams: ["Ana", "martes 14"],
    });
    expect((llamadas[0]!.init.headers as Record<string, string>)["Idempotency-Key"]).toBe("envio-1");
  });

  it("sin teléfono no se llama a nadie", async () => {
    responder(201, {});
    await expect(
      sendZernioTemplate(CREDS, { phone: "", name: "x", language: "es", params: [] })
    ).rejects.toBeInstanceOf(MetaApiError);
    expect(llamadas).toHaveLength(0);
  });

  it("un rechazo de Zernio (plantilla no aprobada, tope diario) sale como error con su motivo", async () => {
    responder(400, { error: { message: "Template not approved", code: 132001 } });
    const err = await sendZernioTemplate(CREDS, {
      phone: "56900000000",
      name: "x",
      language: "es",
      params: [],
    }).catch((e) => e);
    expect(err).toBeInstanceOf(MetaApiError);
    expect(err.status).toBe(400);
    expect(err.message).toBe("Template not approved");
  });
});

describe("080 · entrega 2 · estado de plantillas (T031)", () => {
  it("lee el evento con la plantilla anidada; «NONE» no es un motivo", () => {
    expect(
      zernioTemplateStatus({
        event: "whatsapp.template.status_updated",
        account: { id: CREDS.accountRef },
        template: { name: "recordatorio", language: "es", status: "APPROVED", reason: "NONE" },
      })
    ).toEqual({
      accountRef: CREDS.accountRef,
      name: "recordatorio",
      language: "es",
      status: "approved",
      reason: null,
    });
  });

  it("un rechazo trae su motivo; acepta la forma plana y accountId suelto", () => {
    expect(
      zernioTemplateStatus({
        event: "whatsapp.template.status_updated",
        accountId: CREDS.accountRef,
        name: "promo",
        language: "es",
        status: "REJECTED",
        reason: "INVALID_FORMAT",
      })
    ).toMatchObject({ status: "rejected", reason: "INVALID_FORMAT" });
  });

  it("pausada o deshabilitada deja de ser enviable", () => {
    for (const s of ["PAUSED", "DISABLED"]) {
      expect(
        zernioTemplateStatus({
          event: "whatsapp.template.status_updated",
          account: { id: "a" },
          template: { name: "x", language: "es", status: s },
        })?.status
      ).toBe("rejected");
    }
  });

  it("lo que no es un evento de plantilla, o le falta algo, no es nada", () => {
    expect(zernioTemplateStatus({ event: "message.received" })).toBeNull();
    expect(
      zernioTemplateStatus({ event: "whatsapp.template.status_updated", template: { name: "x" } })
    ).toBeNull();
    for (const x of [null, "x", 1, []]) expect(zernioTemplateStatus(x)).toBeNull();
  });

  it("el reparto manda los eventos de plantillas a WhatsApp aunque no digan la plataforma", () => {
    expect(
      zernioTargetChannel({ event: "whatsapp.template.status_updated", account: { id: "a" } })
    ).toBe("whatsapp");
  });

  it("el webhook de WhatsApp pide los eventos de plantillas", () => {
    const eventos = zernioWebhookEvents({ whatsapp: true });
    for (const e of ZERNIO_WHATSAPP_TEMPLATE_EVENTS) expect(eventos).toContain(e);
    expect(zernioWebhookEvents({ whatsapp: false })).not.toContain(ZERNIO_WHATSAPP_TEMPLATE_EVENTS[0]);
  });
});

describe("080 · entrega 2 · capacidades", () => {
  it("por Zernio ya hay plantillas, y la ventana cerrada pide una como con Meta", () => {
    expect(whatsappCapabilities("zernio").templates).toBe(true);
    expect(whatsappWindowClosedMessage("zernio")).toBe(whatsappWindowClosedMessage("meta"));
  });
});
