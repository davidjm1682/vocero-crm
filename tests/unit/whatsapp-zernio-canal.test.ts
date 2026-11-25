import { describe, expect, it } from "vitest";
import {
  ZERNIO_PLATFORMS,
  accountHealth,
  pickZernioAccount,
  type ZernioAccount,
} from "@/server/zernio/cuentas";
import {
  WEBHOOK_PATH,
  ZERNIO_CHANNELS,
  ZERNIO_SOCIAL_CHANNELS,
} from "@/server/zernio/conexiones";
import { zernioTargetChannel } from "@/server/zernio/dispatch";
import {
  ZERNIO_MESSAGE_EVENT,
  ZERNIO_REACTION_EVENT,
  ZERNIO_WHATSAPP_STATUS_EVENTS,
  coversAccount,
  zernioWebhookEvents,
  type ZernioWebhook,
} from "@/server/zernio/webhooks";

// Cuentas de prueba (ids inventados): un WhatsApp y un Instagram en la misma llave.
const WA = "6b00000000000000000000a1";
const IG = "6b00000000000000000000b2";
const cuentas: ZernioAccount[] = [
  {
    _id: WA,
    platform: "whatsapp",
    username: "+56 9 0000 0000",
    displayName: "Negocio de prueba",
    isActive: true,
    platformStatus: "active",
  },
  { _id: IG, platform: "instagram", username: "negocio.prueba", isActive: true },
];

describe("080 · Zernio admite WhatsApp como canal (T005)", () => {
  it("Zernio llama a la plataforma «whatsapp»", () => {
    expect(ZERNIO_PLATFORMS.whatsapp).toEqual(["whatsapp"]);
  });

  it("una llave con un solo WhatsApp lo elige sin pedir id", () => {
    const r = pickZernioAccount(cuentas, null, "whatsapp");
    expect(r.ok && r.account._id).toBe(WA);
  });

  it("el id de una cuenta de Instagram no vale para WhatsApp y dice cuáles sirven", () => {
    const r = pickZernioAccount(cuentas, IG, "whatsapp");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("unknown_account");
      expect(r.message).toContain(WA);
    }
  });

  it("una llave sin WhatsApp lo dice", () => {
    const r = pickZernioAccount([cuentas[1]!], null, "whatsapp");
    expect(r.ok).toBe(false);
  });

  it("la salud de una cuenta de WhatsApp activa está bien; pedir reconexión es error", () => {
    expect(accountHealth(cuentas[0]!, "whatsapp").level).toBe("ok");
    expect(accountHealth({ ...cuentas[0]!, needsReconnection: true }, "whatsapp").level).toBe(
      "error"
    );
  });
});

describe("080 · conexiones por Zernio incluyen WhatsApp (T006)", () => {
  it("WhatsApp es un canal por Zernio, con el mismo segmento «wa» que el de Meta", () => {
    expect(ZERNIO_CHANNELS).toContain("whatsapp");
    expect(WEBHOOK_PATH.whatsapp).toBe("wa");
  });

  it("los canales sociales no incluyen WhatsApp (sin ellos no hay pantalla de Canales)", () => {
    expect(ZERNIO_SOCIAL_CHANNELS).not.toContain("whatsapp");
    expect([...ZERNIO_SOCIAL_CHANNELS].sort()).toEqual(["instagram", "messenger", "tiktok"]);
  });
});

describe("080 · eventos del webhook (T007)", () => {
  it("los canales sociales siguen pidiendo solo mensajes y reacciones", () => {
    expect(zernioWebhookEvents({ whatsapp: false })).toEqual([
      ZERNIO_MESSAGE_EVENT,
      ZERNIO_REACTION_EVENT,
    ]);
  });

  it("con WhatsApp se piden también los acuses de envío", () => {
    const eventos = zernioWebhookEvents({ whatsapp: true });
    expect(eventos).toEqual([
      ZERNIO_MESSAGE_EVENT,
      ZERNIO_REACTION_EVENT,
      ...ZERNIO_WHATSAPP_STATUS_EVENTS,
    ]);
    expect([...ZERNIO_WHATSAPP_STATUS_EVENTS]).toEqual([
      "message.sent",
      "message.delivered",
      "message.read",
      "message.failed",
    ]);
  });

  it("un webhook con solo los eventos de mensajes sigue cubriendo la cuenta", () => {
    const w: ZernioWebhook = {
      _id: "w1",
      isActive: true,
      events: [ZERNIO_MESSAGE_EVENT],
      accountIds: [WA],
    };
    expect(coversAccount(w, WA)).toBe(true);
  });
});

describe("080 · reparto de eventos (T008)", () => {
  const evento = (platform: string) => ({
    event: "message.received",
    account: { id: WA, platform },
    message: { id: "m1" },
  });

  it("un evento de la plataforma whatsapp va al canal whatsapp", () => {
    expect(zernioTargetChannel(evento("whatsapp"))).toBe("whatsapp");
    expect(zernioTargetChannel(evento("WhatsApp"))).toBe("whatsapp");
  });

  it("los demás siguen yendo a su canal y lo desconocido a ninguno", () => {
    expect(zernioTargetChannel(evento("instagram"))).toBe("instagram");
    expect(zernioTargetChannel(evento("facebook"))).toBe("messenger");
    expect(zernioTargetChannel(evento("tiktok"))).toBe("tiktok");
    expect(zernioTargetChannel(evento("telegram"))).toBeNull();
    expect(zernioTargetChannel(null)).toBeNull();
  });
});
