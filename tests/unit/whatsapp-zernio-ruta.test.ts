import { beforeEach, describe, expect, it, vi } from "vitest";

const recibirEvento = vi.fn(async () => Response.json({ received: true }));
const autentica = vi.fn(async () => true);

vi.mock("@/server/webhooks/recibir", () => ({ recibirEvento }));
vi.mock("@/server/zernio/dispatch", () => ({ isAuthenticZernioDelivery: autentica }));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({ META_WEBHOOK_VERIFY_TOKEN: "seg-secreto", META_APP_SECRET: "app-secret" }),
}));

import { createHmac } from "node:crypto";
import { clasificarEntregaWa } from "@/server/whatsapp-zernio/entrega";

const ZERNIO = JSON.stringify({
  id: "evt_1",
  event: "message.received",
  account: { id: "acc1", platform: "whatsapp" },
  message: { id: "m1" },
});
const META = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
const firmaMeta = (body: string) =>
  `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;

async function post(body: string, headers: Record<string, string> = {}, token = "seg-secreto") {
  const { POST } = await import("@/app/api/webhooks/wa/[webhookToken]/route");
  return POST(
    new Request("http://x/api/webhooks/wa/" + token, { method: "POST", body, headers }),
    { params: Promise.resolve({ webhookToken: token }) }
  );
}

beforeEach(() => {
  recibirEvento.mockClear();
  autentica.mockReset();
  autentica.mockResolvedValue(true);
});

describe("080 · quién llama a /api/webhooks/wa (T021)", () => {
  it("un evento con `account` es de Zernio; uno con `object` es de Meta", () => {
    expect(clasificarEntregaWa(ZERNIO).quien).toBe("zernio");
    expect(clasificarEntregaWa(META).quien).toBe("meta");
  });

  it("un cuerpo con `account` Y `object` se trata como Meta (nunca se salta su firma)", () => {
    const mixto = JSON.stringify({ object: "whatsapp_business_account", account: { id: "x" } });
    expect(clasificarEntregaWa(mixto).quien).toBe("meta");
  });

  it("basura ilegible es Meta con payload nulo", () => {
    expect(clasificarEntregaWa("no es json")).toEqual({ quien: "meta", payload: null });
  });
});

describe("080 · ruta POST /api/webhooks/wa/[token]", () => {
  it("segmento equivocado: 404 sin efectos, venga de quien venga", async () => {
    expect((await post(ZERNIO, {}, "otro")).status).toBe(404);
    expect((await post(META, {}, "otro")).status).toBe(404);
    expect(recibirEvento).not.toHaveBeenCalled();
  });

  it("Zernio con firma válida: se guarda por la fuente «zernio»", async () => {
    const r = await post(ZERNIO, { "x-zernio-signature": "abc" });
    expect(r.status).toBe(200);
    expect(autentica).toHaveBeenCalledWith(ZERNIO, "abc");
    expect(recibirEvento).toHaveBeenCalledWith("zernio", expect.objectContaining({ id: "evt_1" }), ZERNIO, "wa");
  });

  it("Zernio con firma inválida: 401 y nada se guarda", async () => {
    autentica.mockResolvedValue(false);
    expect((await post(ZERNIO, { "x-zernio-signature": "mala" })).status).toBe(401);
    expect(recibirEvento).not.toHaveBeenCalled();
  });

  it("Meta con su firma: sigue entrando por la fuente «whatsapp»", async () => {
    const r = await post(META, { "x-hub-signature-256": firmaMeta(META) });
    expect(r.status).toBe(200);
    expect(autentica).not.toHaveBeenCalled();
    expect(recibirEvento).toHaveBeenCalledWith("whatsapp", expect.any(Object), META, "webhook");
  });

  it("Meta sin firma o con firma ajena: 401", async () => {
    expect((await post(META)).status).toBe(401);
    expect((await post(META, { "x-hub-signature-256": "sha256=00" })).status).toBe(401);
    expect(recibirEvento).not.toHaveBeenCalled();
  });

  it("la firma de Zernio no vale como la de Meta, ni al revés", async () => {
    // Un cuerpo de Meta con cabecera de Zernio sigue exigiendo la firma de Meta.
    expect((await post(META, { "x-zernio-signature": "abc" })).status).toBe(401);
    // Un evento de Zernio con firma de Meta no se salta la verificación de Zernio.
    autentica.mockResolvedValue(false);
    expect((await post(ZERNIO, { "x-hub-signature-256": firmaMeta(ZERNIO) })).status).toBe(401);
  });

  it("cuerpo ilegible con firma de Meta válida: 200 sin guardar", async () => {
    const r = await post("no es json", { "x-hub-signature-256": firmaMeta("no es json") });
    expect(r.status).toBe(200);
    expect(recibirEvento).not.toHaveBeenCalled();
  });
});
