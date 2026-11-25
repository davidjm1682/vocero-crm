import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  autorizacionDeDescarga,
  origenOf,
  payloadPublico,
  sha256Coincide,
  splitInbound,
  urlDeAdjuntoPermitida,
} from "@/server/inbox/remote-media";
import { mediaRemota } from "@/server/inbox/ingest";
import { DescargaRemotaError, descargarAdjuntoRemoto } from "@/server/inbox/descarga-remota";

const MEDIA = "https://zernio.com/api/v1/whatsapp/media/m1?accountId=6b00000000000000000000a1";

describe("080 · URL de un adjunto de WhatsApp por Zernio (T011/T012)", () => {
  it("vale https a zernio.com y a sus subdominios", () => {
    expect(urlDeAdjuntoPermitida(MEDIA, "zernio-whatsapp")).toBe(true);
    expect(urlDeAdjuntoPermitida("https://api.zernio.com/x", "zernio-whatsapp")).toBe(true);
  });

  it("no vale otro host, ni uno que solo lo contiene, ni http, ni puerto, ni usuario", () => {
    for (const mala of [
      "https://example.com/x",
      "https://zernio.com.evil.example/x",
      "https://evilzernio.com/x",
      "https://zernio.co/x",
      "http://zernio.com/x",
      "https://zernio.com:8443/x",
      "https://user:pw@zernio.com/x",
      "https://127.0.0.1/x",
      "no es una url",
    ]) {
      expect(urlDeAdjuntoPermitida(mala, "zernio-whatsapp"), mala).toBe(false);
    }
  });

  it("el origen de Zernio genérico (TikTok, Instagram) no cambia", () => {
    expect(urlDeAdjuntoPermitida("https://cdn.example.com/a.jpg", "zernio")).toBe(true);
  });

  it("el origen guardado en el payload se lee, y uno desconocido cae en el más estricto", () => {
    expect(origenOf({ origen: "zernio-whatsapp" })).toBe("zernio-whatsapp");
    expect(origenOf({ origen: "otro" })).toBe("meta");
  });
});

describe("080 · la llave de Zernio solo viaja a zernio.com", () => {
  it("con origen zernio-whatsapp y host de Zernio, va como Bearer", () => {
    expect(autorizacionDeDescarga("zernio-whatsapp", MEDIA, "sk_test_123")).toBe("Bearer sk_test_123");
  });

  it("sin llave, o con otro origen, o con otro host, no va nada", () => {
    expect(autorizacionDeDescarga("zernio-whatsapp", MEDIA, null)).toBeNull();
    expect(autorizacionDeDescarga("zernio", MEDIA, "sk_test_123")).toBeNull();
    expect(autorizacionDeDescarga("meta", MEDIA, "sk_test_123")).toBeNull();
    expect(autorizacionDeDescarga("zernio-whatsapp", "https://example.com/x", "sk_test_123")).toBeNull();
    expect(autorizacionDeDescarga("zernio-whatsapp", "https://zernio.com.evil.example/x", "sk_test_123")).toBeNull();
  });
});

describe("080 · sha256 del adjunto", () => {
  const data = Buffer.from("contenido de prueba");
  const hex = createHash("sha256").update(data).digest("hex");
  const b64 = createHash("sha256").update(data).digest("base64");

  it("coincide en hex (sin importar mayúsculas) o en base64", () => {
    expect(sha256Coincide(data, hex)).toBe(true);
    expect(sha256Coincide(data, hex.toUpperCase())).toBe(true);
    expect(sha256Coincide(data, b64)).toBe(true);
  });

  it("no coincide si el contenido o el hash son otros", () => {
    expect(sha256Coincide(Buffer.from("otro"), hex)).toBe(false);
    expect(sha256Coincide(data, "0".repeat(64))).toBe(false);
  });

  it("sin hash declarado no hay con qué comparar y se acepta", () => {
    expect(sha256Coincide(data, null)).toBe(true);
    expect(sha256Coincide(data, "")).toBe(true);
    expect(sha256Coincide(data, undefined)).toBe(true);
  });
});

describe("080 · el adjunto de WhatsApp por Zernio entra a la bandeja", () => {
  it("splitInbound parte texto y adjunto, y lleva el tipo, el hash y el nombre al medio", () => {
    const partes = splitInbound(
      "Mira",
      [
        {
          type: "file",
          url: MEDIA,
          payload: { mimeType: "application/pdf", sha256: "abc", filename: "cotizacion.pdf" },
        } as never,
      ],
      "zernio-whatsapp"
    );
    expect(partes.map((p) => p.type)).toEqual(["text", "document"]);
    expect(partes[1]!.media).toMatchObject({
      kind: "document",
      sourceUrl: MEDIA,
      origen: "zernio-whatsapp",
      mimeType: "application/pdf",
      sha256: "abc",
      fileName: "cotizacion.pdf",
    });
  });

  it("mediaRemota guarda la URL, el origen y el hash en el payload y el tipo en la fila", () => {
    const m = mediaRemota({
      kind: "image",
      sourceUrl: MEDIA,
      origen: "zernio-whatsapp",
      mimeType: "image/jpeg",
      sha256: "abc",
      fileName: null,
    });
    expect(m.mimeType).toBe("image/jpeg");
    expect(m.payload).toEqual({ sourceUrl: MEDIA, origen: "zernio-whatsapp", sha256: "abc" });
    expect(m.fetchStatus).toBe("pending");
  });

  it("la bandeja no recibe la URL, el origen ni el hash", () => {
    expect(
      payloadPublico({ sourceUrl: MEDIA, origen: "zernio-whatsapp", sha256: "abc" })
    ).toBeNull();
  });
});

describe("080 · descargarAdjuntoRemoto: casos infelices sin red", () => {
  it("una URL ajena a zernio.com se rechaza antes de conectar, sin reintento", async () => {
    await expect(
      descargarAdjuntoRemoto("https://example.com/x", "zernio-whatsapp", 1024, { token: "k" })
    ).rejects.toMatchObject({ name: "DescargaRemotaError", gone: true });
  });

  it("sin llave de Zernio no se intenta", async () => {
    const err = await descargarAdjuntoRemoto(MEDIA, "zernio-whatsapp", 1024, {}).catch((e) => e);
    expect(err).toBeInstanceOf(DescargaRemotaError);
    expect(err.message).toMatch(/llave/i);
  });
});
