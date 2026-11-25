import { describe, expect, it } from "vitest";
import { isUpgrade } from "@/server/inbox/status";
import { describeSendError } from "@/lib/meta/send-errors";
import { zernioEventToStatus } from "@/server/whatsapp-zernio/status";

const CUENTA = "6b00000000000000000000a1";
const WAMID = "wamid.OUT0001";

function acuse(event: string, extra: Record<string, unknown> = {}, message: Record<string, unknown> = {}) {
  return {
    id: `evt_${event}`,
    event,
    message: {
      id: "zmsg_out_1",
      platform: "whatsapp",
      platformMessageId: WAMID,
      direction: "outgoing",
      statusAt: "2026-11-25T14:01:00.000Z",
      ...message,
    },
    account: { id: CUENTA, platform: "whatsapp" },
    ...extra,
  };
}

describe("080 · acuses de WhatsApp por Zernio → estado del mensaje (T014)", () => {
  it("sent, delivered y read se convierten en su estado, con el wamid como id", () => {
    for (const [evento, estado] of [
      ["message.sent", "sent"],
      ["message.delivered", "delivered"],
      ["message.read", "read"],
    ] as const) {
      const s = zernioEventToStatus(acuse(evento));
      expect(s).toMatchObject({ id: WAMID, status: estado });
      expect(s!.timestamp).toBe(String(Math.floor(Date.parse("2026-11-25T14:01:00.000Z") / 1000)));
    }
  });

  it("sin platformMessageId se usa el id del mensaje de Zernio", () => {
    expect(zernioEventToStatus(acuse("message.read", {}, { platformMessageId: undefined }))!.id).toBe(
      "zmsg_out_1"
    );
  });

  it("failed trae el código y el motivo, venga donde venga", () => {
    const enMensaje = zernioEventToStatus(
      acuse("message.failed", {}, { error: { code: 131047, message: "Re-engagement message" } })
    );
    expect(enMensaje).toMatchObject({ status: "failed" });
    expect(enMensaje!.errors?.[0]).toMatchObject({ code: 131047 });

    const enEvento = zernioEventToStatus(
      acuse("message.failed", { error: { code: "131026", message: "Undeliverable" } })
    );
    expect(enEvento!.errors?.[0]).toMatchObject({ code: 131026 });

    const sinCodigo = zernioEventToStatus(
      acuse("message.failed", { error: { message: "Algo falló" } })
    );
    expect(sinCodigo!.status).toBe("failed");
    expect(sinCodigo!.errors?.[0]?.message).toBe("Algo falló");
  });

  it("failed sin ningún detalle sigue siendo failed", () => {
    expect(zernioEventToStatus(acuse("message.failed"))).toMatchObject({ status: "failed" });
  });

  it("el motivo se traduce con el mismo traductor que los fallos de Meta", () => {
    const s = zernioEventToStatus(acuse("message.failed", { error: { code: 131047 } }))!;
    const f = s.errors![0]!;
    expect(describeSendError(f.code, f.message ?? f.title)).toContain("24 h");
  });

  it("no son acuses: mensajes entrantes, otras plataformas, eventos raros, basura", () => {
    expect(zernioEventToStatus(acuse("message.received"))).toBeNull();
    expect(zernioEventToStatus(acuse("conversation.started"))).toBeNull();
    const ig = acuse("message.read");
    ig.account.platform = "instagram";
    expect(zernioEventToStatus(ig)).toBeNull();
    expect(zernioEventToStatus(acuse("message.read", {}, { platformMessageId: undefined, id: undefined }))).toBeNull();
    for (const x of [null, undefined, "x", 3, []]) expect(zernioEventToStatus(x)).toBeNull();
  });
});

describe("080 · los acuses llegan en cualquier orden (T015)", () => {
  const permutaciones = <T,>(xs: T[]): T[][] =>
    xs.length <= 1
      ? [xs]
      : xs.flatMap((x, i) =>
          permutaciones([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])
        );

  // Lo que hace `applyStatusUpdate` con cada acuse: subir, nunca bajar.
  const plegar = (eventos: string[]) =>
    eventos.reduce((actual, e) => {
      const s = zernioEventToStatus(acuse(e))!;
      return isUpgrade(actual, s.status) ? s.status : actual;
    }, "pending");

  it("con sent, delivered y read en cualquier orden queda read", () => {
    for (const orden of permutaciones(["message.sent", "message.delivered", "message.read"])) {
      expect(plegar(orden), orden.join(" > ")).toBe("read");
    }
  });

  it("un delivered tardío no baja un read", () => {
    expect(plegar(["message.read", "message.delivered"])).toBe("read");
  });

  it("la plantilla que llega como read sin delivered previo queda read", () => {
    expect(plegar(["message.sent", "message.read"])).toBe("read");
  });

  it("failed gana sobre sent y delivered, y no se repite", () => {
    expect(plegar(["message.sent", "message.failed"])).toBe("failed");
    expect(plegar(["message.failed", "message.sent"])).toBe("failed");
  });
});
