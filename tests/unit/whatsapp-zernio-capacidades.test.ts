import { describe, expect, it } from "vitest";
import {
  CHANNEL_CAPABILITIES,
  whatsappCapabilities,
  whatsappWindowClosedMessage,
} from "@/server/channels/capabilities";

describe("080 · capacidades de WhatsApp por fuente (T019)", () => {
  it("por Meta: todo, con plantillas", () => {
    const c = whatsappCapabilities("meta");
    expect(c.templates).toBe(true);
    expect(c).toBe(CHANNEL_CAPABILITIES.whatsapp);
  });

  it("sin fuente se comporta como Meta (nada cambia para quien no usa Zernio)", () => {
    expect(whatsappCapabilities(null)).toBe(CHANNEL_CAPABILITIES.whatsapp);
  });

  it("por Zernio: lo verificado (ventana, adjuntos, ubicación, contactos, citas, acuses) sí; plantillas aún no", () => {
    const c = whatsappCapabilities("zernio");
    expect(c).toMatchObject({
      windowMs: CHANNEL_CAPABILITIES.whatsapp.windowMs,
      outboundMedia: true,
      structuredMessages: true,
      quoteReplies: true,
      deliveryReceipts: true,
      templates: false,
    });
  });

  it("solo WhatsApp por Meta tiene plantillas", () => {
    expect(
      Object.entries(CHANNEL_CAPABILITIES)
        .filter(([, v]) => v.templates)
        .map(([k]) => k)
    ).toEqual(["whatsapp"]);
  });

  it("ventana cerrada: por Meta pide plantilla; por Zernio explica por qué no", () => {
    expect(whatsappWindowClosedMessage("meta")).toMatch(/plantilla aprobada/);
    const z = whatsappWindowClosedMessage("zernio");
    expect(z).toMatch(/Zernio/);
    expect(z).not.toMatch(/usa una plantilla/);
  });
});
