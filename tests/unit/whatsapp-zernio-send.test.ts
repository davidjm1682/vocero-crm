import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendWhatsappViaZernio } from "@/server/whatsapp-zernio/send";
import { MetaApiError } from "@/lib/meta/client";

const CREDS = { token: "sk_test_abc", accountRef: "6b00000000000000000000a1" };
const HILO = "conv_1";

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
const cabecera = (n: string, i = 0) =>
  (llamadas[i]!.init.headers as Record<string, string>)[n];

beforeEach(() => {
  llamadas = [];
});
afterEach(() => vi.unstubAllGlobals());

describe("080 · envío de WhatsApp por Zernio (T016)", () => {
  it("texto: POST a la conversación con la cuenta, la llave y el mensaje", async () => {
    responder(200, { success: true, data: { messageId: "wamid.OUT1" } });
    const r = await sendWhatsappViaZernio({
      creds: CREDS,
      conversationId: HILO,
      payload: { kind: "text", text: "Hola" },
    });
    expect(r.platformMessageId).toBe("wamid.OUT1");
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]!.url).toMatch(/\/inbox\/conversations\/conv_1\/messages$/);
    expect(cabecera("Authorization")).toBe("Bearer sk_test_abc");
    expect(cuerpo()).toEqual({ accountId: CREDS.accountRef, message: "Hola" });
  });

  it("cita: replyTo lleva el wamid del citado", async () => {
    responder(200, { data: { messageId: "wamid.OUT2" } });
    await sendWhatsappViaZernio({
      creds: CREDS,
      conversationId: HILO,
      payload: { kind: "text", text: "Sí" },
      replyTo: "wamid.CITADO",
    });
    expect(cuerpo()).toMatchObject({ message: "Sí", replyTo: "wamid.CITADO" });
  });

  it("sin cita, el cuerpo no lleva replyTo", async () => {
    responder(200, { data: { messageId: "wamid.OUT3" } });
    await sendWhatsappViaZernio({
      creds: CREDS,
      conversationId: HILO,
      payload: { kind: "text", text: "Sí" },
      replyTo: null,
    });
    expect(cuerpo()).not.toHaveProperty("replyTo");
  });

  it("ubicación: location con coordenadas, nombre y dirección, sin texto", async () => {
    responder(200, { data: { messageId: "wamid.OUT4" } });
    await sendWhatsappViaZernio({
      creds: CREDS,
      conversationId: HILO,
      payload: {
        kind: "location",
        location: { latitude: -33.45, longitude: -70.66, name: "Oficina", address: "Calle 1" },
      },
    });
    expect(cuerpo()).toEqual({
      accountId: CREDS.accountRef,
      location: { latitude: -33.45, longitude: -70.66, name: "Oficina", address: "Calle 1" },
    });
  });

  it("contactos: tarjetas con nombre y teléfono en el formato de Meta", async () => {
    responder(200, { data: { messageId: "wamid.OUT5" } });
    await sendWhatsappViaZernio({
      creds: CREDS,
      conversationId: HILO,
      payload: { kind: "contacts", contacts: [{ name: "Persona de Prueba", phone: "+56911111111" }] },
    });
    expect(cuerpo().contacts).toEqual([
      {
        name: { formatted_name: "Persona de Prueba", first_name: "Persona de Prueba" },
        phones: [{ phone: "+56911111111", type: "CELL" }],
      },
    ]);
  });

  it("adjunto: multipart con el archivo en «attachment», el tipo y el pie, sin Content-Type JSON", async () => {
    responder(200, { data: { messageId: "wamid.OUT6" } });
    await sendWhatsappViaZernio({
      creds: CREDS,
      conversationId: HILO,
      payload: {
        kind: "media",
        file: { data: Buffer.from("PDFDATA"), mimeType: "application/pdf", fileName: "cotizacion.pdf" },
        mediaKind: "document",
        caption: "Tu cotización",
      },
      replyTo: "wamid.CITADO",
    });
    const form = llamadas[0]!.init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("accountId")).toBe(CREDS.accountRef);
    expect(form.get("message")).toBe("Tu cotización");
    expect(form.get("attachmentType")).toBe("file");
    expect(form.get("replyTo")).toBe("wamid.CITADO");
    const archivo = form.get("attachment") as File;
    expect(archivo.name).toBe("cotizacion.pdf");
    expect(archivo.type).toBe("application/pdf");
    expect(Buffer.from(await archivo.arrayBuffer()).toString()).toBe("PDFDATA");
    expect(cabecera("Content-Type")).toBeUndefined();
  });

  it("nota de voz: audio con voiceNote", async () => {
    responder(200, { data: { messageId: "wamid.OUT7" } });
    await sendWhatsappViaZernio({
      creds: CREDS,
      conversationId: HILO,
      payload: {
        kind: "media",
        file: { data: Buffer.from("OGG"), mimeType: "audio/ogg", fileName: "voz.ogg" },
        mediaKind: "audio",
        voice: true,
      },
    });
    const form = llamadas[0]!.init.body as FormData;
    expect(form.get("attachmentType")).toBe("audio");
    expect(form.get("voiceNote")).toBe("true");
  });

  it("los tipos de adjunto se traducen: image, video, audio y document→file", async () => {
    for (const [mediaKind, esperado, mime] of [
      ["image", "image", "image/jpeg"],
      ["video", "video", "video/mp4"],
      ["audio", "audio", "audio/mpeg"],
      ["document", "file", "application/pdf"],
    ] as const) {
      llamadas = [];
      responder(200, { data: { messageId: "wamid.X" } });
      await sendWhatsappViaZernio({
        creds: CREDS,
        conversationId: HILO,
        payload: { kind: "media", file: { data: Buffer.from("x"), mimeType: mime }, mediaKind },
      });
      expect((llamadas[0]!.init.body as FormData).get("attachmentType")).toBe(esperado);
    }
  });

  it("Idempotency-Key viaja como cabecera", async () => {
    responder(200, { data: { messageId: "wamid.OUT8" } });
    await sendWhatsappViaZernio({
      creds: CREDS,
      conversationId: HILO,
      payload: { kind: "text", text: "Hola" },
      idempotencyKey: "envio-123",
    });
    expect(cabecera("Idempotency-Key")).toBe("envio-123");
  });

  it("sin referencia de hilo no se llama a nadie", async () => {
    responder(200, {});
    await expect(
      sendWhatsappViaZernio({
        creds: CREDS,
        conversationId: null,
        payload: { kind: "text", text: "Hola" },
      })
    ).rejects.toBeInstanceOf(MetaApiError);
    expect(llamadas).toHaveLength(0);
  });

  it("una llave muerta (401) sale como error de autenticación", async () => {
    responder(401, { error: "Invalid API key" });
    const err = await sendWhatsappViaZernio({
      creds: CREDS,
      conversationId: HILO,
      payload: { kind: "text", text: "Hola" },
    }).catch((e) => e);
    expect(err).toBeInstanceOf(MetaApiError);
    expect(err.isAuthError).toBe(true);
  });

  it("Zernio caído (sin respuesta) sale con status 0", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("ECONNRESET"))));
    const err = await sendWhatsappViaZernio({
      creds: CREDS,
      conversationId: HILO,
      payload: { kind: "text", text: "Hola" },
    }).catch((e) => e);
    expect(err).toBeInstanceOf(MetaApiError);
    expect(err.status).toBe(0);
  });
});
