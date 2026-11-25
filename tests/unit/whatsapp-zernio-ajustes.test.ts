import { beforeEach, describe, expect, it, vi } from "vitest";

const sesion = { organizationId: "org_1", role: "owner" as "owner" | "member" };
const flag = { on: true };
const fuente = vi.fn(async () => ({ ok: true }) as unknown);
const resolver = vi.fn();
const guardar = vi.fn(async () => {});
const borrar = vi.fn(async () => {});
const leer = vi.fn(async () => null as unknown);
const webhook = vi.fn(async () => ({ ok: true, created: true, accounts: 1 }));

vi.mock("@/lib/auth/session", () => ({
  requireSession: async () => sesion,
  UnauthorizedError: class extends Error {},
}));
vi.mock("@/server/whatsapp-zernio/flag", () => ({
  whatsappZernioEnabled: () => flag.on,
  whatsappZernioDisabledResponse: () => new Response(null, { status: 404 }),
}));
vi.mock("@/server/whatsapp-zernio/source", () => ({ puedeConectarFuente: fuente }));
vi.mock("@/server/whatsapp-zernio/credentials", () => ({
  getWhatsappZernioCredentialsByOrg: leer,
  saveWhatsappZernioCredentials: guardar,
  deleteWhatsappZernioCredentials: borrar,
  tokenLast4: (t: string) => t.slice(-4),
}));
vi.mock("@/server/zernio/guardar", () => ({ resolveZernioAccount: resolver }));
vi.mock("@/server/zernio/conexiones", () => ({ ensureWebhookForOrg: webhook }));

const CUENTA = { _id: "acc_wa", platform: "whatsapp", username: "+56 9 0000 0000", displayName: "Negocio", isActive: true };

async function llamar(metodo: "GET" | "PUT" | "DELETE", body?: unknown) {
  const ruta = await import("@/app/api/settings/whatsapp-zernio/route");
  const req = new Request("http://x/api/settings/whatsapp-zernio", {
    method: metodo,
    body: body === undefined || metodo === "GET" ? undefined : JSON.stringify(body),
  });
  return metodo === "GET" ? ruta.GET() : metodo === "PUT" ? ruta.PUT(req) : ruta.DELETE();
}

beforeEach(() => {
  sesion.role = "owner";
  flag.on = true;
  for (const m of [fuente, resolver, guardar, borrar, leer, webhook]) m.mockClear();
  fuente.mockResolvedValue({ ok: true });
  resolver.mockResolvedValue({ ok: true, account: CUENTA });
  leer.mockResolvedValue(null);
});

describe("080 · /api/settings/whatsapp-zernio (T022)", () => {
  it("sin la bandera, todo es 404 y no toca nada", async () => {
    flag.on = false;
    for (const m of ["GET", "PUT", "DELETE"] as const) {
      expect((await llamar(m, { token: "sk_x" })).status, m).toBe(404);
    }
    expect(guardar).not.toHaveBeenCalled();
    expect(borrar).not.toHaveBeenCalled();
  });

  it("GET sin conexión: null", async () => {
    expect(await (await llamar("GET")).json()).toEqual({ connection: null });
  });

  it("GET con conexión: solo la cola de la llave, nunca la llave ni el secreto", async () => {
    leer.mockResolvedValue({
      source: "zernio", accountRef: "acc_wa", displayPhoneNumber: "+56 9 0000 0000",
      verifiedName: "Negocio", status: "connected", token: "sk_live_SECRETO1234", webhookSecret: "whsec_abc",
    });
    const texto = await (await llamar("GET")).text();
    expect(texto).toContain("1234");
    expect(texto).not.toContain("sk_live_SECRETO1234");
    expect(texto).not.toContain("whsec_abc");
    expect(JSON.parse(texto).connection).toMatchObject({ tokenLast4: "1234", hasWebhookSecret: true });
  });

  it("PUT guarda la cuenta que resolvió Zernio y da de alta el webhook", async () => {
    const r = await llamar("PUT", { token: "sk_test_1" });
    expect(r.status).toBe(200);
    expect(resolver).toHaveBeenCalledWith("sk_test_1", undefined, "whatsapp");
    expect(guardar).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org_1", accountRef: "acc_wa", token: "sk_test_1", displayPhoneNumber: "+56 9 0000 0000" })
    );
    expect(webhook).toHaveBeenCalledOnce();
    expect(JSON.stringify(await r.json())).not.toContain("sk_test_1");
  });

  it("PUT con una llave que Zernio rechaza: no se guarda nada", async () => {
    resolver.mockResolvedValue({ ok: false, response: Response.json({ error: { code: "invalid_token" } }, { status: 422 }) });
    expect((await llamar("PUT", { token: "mala" })).status).toBe(422);
    expect(guardar).not.toHaveBeenCalled();
    expect(webhook).not.toHaveBeenCalled();
  });

  it("PUT con Meta ya conectado: 409 y no se llama a Zernio", async () => {
    fuente.mockResolvedValue({ ok: false, actual: "meta", mensaje: "Este WhatsApp ya está conectado por Meta." });
    const r = await llamar("PUT", { token: "sk_test_1" });
    expect(r.status).toBe(409);
    expect((await r.json()).error.code).toBe("source_conflict");
    expect(resolver).not.toHaveBeenCalled();
    expect(guardar).not.toHaveBeenCalled();
  });

  it("PUT sin llave: 422", async () => {
    expect((await llamar("PUT", {})).status).toBe(422);
  });

  it("solo el propietario conecta o desconecta", async () => {
    sesion.role = "member";
    expect((await llamar("PUT", { token: "sk_test_1" })).status).toBe(403);
    expect((await llamar("DELETE")).status).toBe(403);
    expect(guardar).not.toHaveBeenCalled();
    expect(borrar).not.toHaveBeenCalled();
  });

  it("DELETE desconecta", async () => {
    expect((await llamar("DELETE")).status).toBe(200);
    expect(borrar).toHaveBeenCalledWith("org_1");
  });
});
