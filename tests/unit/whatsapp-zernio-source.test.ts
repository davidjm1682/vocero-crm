import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 080 · D1 — Una organización usa UNA fuente de WhatsApp a la vez: Meta directo
 * o la cuenta de Zernio del negocio. Se decide en un solo lugar, en código, y
 * `meta_credentials` no se toca.
 */

let meta: { organizationId: string } | null = null;
let zernio: { organizationId: string } | null = null;

vi.mock("@/server/whatsapp/credentials", () => ({
  getCredentialsByOrg: async () => meta,
}));
vi.mock("@/server/whatsapp-zernio/credentials", () => ({
  getWhatsappZernioCredentialsByOrg: async () => zernio,
}));

beforeEach(() => {
  meta = null;
  zernio = null;
  delete process.env.WHATSAPP_ZERNIO;
});

describe("getWhatsappSource", () => {
  it("sin ninguna conexión, null", async () => {
    const { getWhatsappSource } = await import("@/server/whatsapp-zernio/source");
    expect(await getWhatsappSource("org_1")).toBeNull();
  });

  it("solo Meta → meta; solo Zernio → zernio", async () => {
    const { getWhatsappSource } = await import("@/server/whatsapp-zernio/source");
    meta = { organizationId: "org_1" };
    expect(await getWhatsappSource("org_1")).toBe("meta");
    meta = null;
    zernio = { organizationId: "org_1" };
    expect(await getWhatsappSource("org_1")).toBe("zernio");
  });

  it("si por un descuido hubiera las dos, gana Meta: es lo que ya funcionaba antes", async () => {
    const { getWhatsappSource } = await import("@/server/whatsapp-zernio/source");
    meta = { organizationId: "org_1" };
    zernio = { organizationId: "org_1" };
    expect(await getWhatsappSource("org_1")).toBe("meta");
  });

  it("la bandera NO corta una conexión ya guardada: apagarla no pierde los mensajes de los clientes", async () => {
    const { getWhatsappSource } = await import("@/server/whatsapp-zernio/source");
    zernio = { organizationId: "org_1" };
    process.env.WHATSAPP_ZERNIO = "off";
    expect(await getWhatsappSource("org_1")).toBe("zernio");
    process.env.WHATSAPP_ZERNIO = "on";
    expect(await getWhatsappSource("org_1")).toBe("zernio");
  });
});

describe("puedeConectarFuente: la exclusión se hace cumplir en código", () => {
  it("sin ninguna conexión se puede conectar cualquiera de las dos", async () => {
    const { puedeConectarFuente } = await import("@/server/whatsapp-zernio/source");
    expect(await puedeConectarFuente("org_1", "meta")).toEqual({ ok: true });
    expect(await puedeConectarFuente("org_1", "zernio")).toEqual({ ok: true });
  });

  it("con Meta conectada, Zernio no se puede guardar sin desconectar Meta", async () => {
    const { puedeConectarFuente } = await import("@/server/whatsapp-zernio/source");
    meta = { organizationId: "org_1" };
    const r = await puedeConectarFuente("org_1", "zernio");
    expect(r).toMatchObject({ ok: false, actual: "meta" });
    expect(r.ok === false && r.mensaje).toMatch(/Meta/);
  });

  it("con Zernio conectada, Meta no se puede guardar sin desconectar Zernio", async () => {
    const { puedeConectarFuente } = await import("@/server/whatsapp-zernio/source");
    zernio = { organizationId: "org_1" };
    const r = await puedeConectarFuente("org_1", "meta");
    expect(r).toMatchObject({ ok: false, actual: "zernio" });
    expect(r.ok === false && r.mensaje).toMatch(/Zernio/);
  });

  it("reconectar la MISMA fuente (cambiar la llave) siempre se puede", async () => {
    const { puedeConectarFuente } = await import("@/server/whatsapp-zernio/source");
    meta = { organizationId: "org_1" };
    expect(await puedeConectarFuente("org_1", "meta")).toEqual({ ok: true });
    meta = null;
    zernio = { organizationId: "org_1" };
    expect(await puedeConectarFuente("org_1", "zernio")).toEqual({ ok: true });
  });
});
