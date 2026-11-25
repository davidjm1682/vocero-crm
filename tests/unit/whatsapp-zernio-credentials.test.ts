import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 080 — Credenciales del WhatsApp conectado por la cuenta de Zernio del propio
 * negocio. La llave y el secreto de firma se guardan cifrados (jamás texto
 * plano en la fila), la tabla NO lleva la columna en claro que la 030 dejó
 * obsoleta, y una organización usa UNA fuente de WhatsApp a la vez.
 */

const inserted: Record<string, unknown>[] = [];
const updated: Record<string, unknown>[] = [];
let deleted = 0;
/** Lo que devuelve el SELECT (el filtro lo hace la base; aquí solo importa la forma). */
let filas: Record<string, unknown>[] = [];

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(filas) }),
      }),
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserted.push(v);
        return Promise.resolve();
      },
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => {
        updated.push(v);
        return { where: () => Promise.resolve() };
      },
    }),
    delete: () => ({
      where: () => {
        deleted += 1;
        return Promise.resolve();
      },
    }),
  }),
  schema: {
    whatsappZernioCredentials: {
      id: "id",
      organizationId: "organization_id",
      accountRef: "account_ref",
    },
  },
}));

beforeAll(() => {
  process.env.APP_BASE_URL = "http://localhost:3000";
  process.env.DATABASE_URL = "postgresql://t:t@localhost:5432/t";
  process.env.BETTER_AUTH_SECRET = "secret-de-test-suficiente";
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  process.env.META_WEBHOOK_VERIFY_TOKEN = "verify-test";
});

beforeEach(() => {
  inserted.length = 0;
  updated.length = 0;
  deleted = 0;
  filas = [];
});

const LLAVE = "zrk_llave-super-secreta-abcd";
const SECRETO = "secreto-hmac-super-secreto-1234";

describe("saveWhatsappZernioCredentials", () => {
  it("cifra la llave y el secreto: la fila no contiene ninguno de los dos en claro", async () => {
    const { saveWhatsappZernioCredentials } = await import(
      "@/server/whatsapp-zernio/credentials"
    );
    await saveWhatsappZernioCredentials({
      organizationId: "org_1",
      accountRef: "acc_1",
      displayPhoneNumber: "+56900000000",
      verifiedName: "Inmobiliaria de prueba",
      token: LLAVE,
      webhookSecret: SECRETO,
    });
    const row = inserted[0]!;
    const serializada = JSON.stringify(row);
    expect(serializada).not.toContain(LLAVE);
    expect(serializada).not.toContain(SECRETO);
    for (const campo of ["tokenCipher", "tokenIv", "tokenTag"]) {
      expect(row[campo], campo).toBeTruthy();
    }
    for (const campo of [
      "webhookSecretCipher",
      "webhookSecretIv",
      "webhookSecretTag",
    ]) {
      expect(row[campo], campo).toBeTruthy();
    }
  });

  it("no escribe la columna en claro que la 030 dejó obsoleta: esa tabla no la tiene", async () => {
    const { saveWhatsappZernioCredentials } = await import(
      "@/server/whatsapp-zernio/credentials"
    );
    await saveWhatsappZernioCredentials({
      organizationId: "org_1",
      accountRef: "acc_1",
      displayPhoneNumber: null,
      verifiedName: null,
      token: LLAVE,
      webhookSecret: SECRETO,
    });
    expect(Object.keys(inserted[0]!)).not.toContain("webhookSecret");
  });

  it("el cifrado es reversible con la clave de la instancia", async () => {
    const { saveWhatsappZernioCredentials } = await import(
      "@/server/whatsapp-zernio/credentials"
    );
    const { decryptSecret } = await import("@/lib/crypto");
    await saveWhatsappZernioCredentials({
      organizationId: "org_1",
      accountRef: "acc_1",
      displayPhoneNumber: null,
      verifiedName: null,
      token: LLAVE,
      webhookSecret: SECRETO,
    });
    const row = inserted[0]!;
    expect(
      decryptSecret({
        cipher: row.tokenCipher as string,
        iv: row.tokenIv as string,
        tag: row.tokenTag as string,
      })
    ).toBe(LLAVE);
    expect(
      decryptSecret({
        cipher: row.webhookSecretCipher as string,
        iv: row.webhookSecretIv as string,
        tag: row.webhookSecretTag as string,
      })
    ).toBe(SECRETO);
  });

  it("sin secreto de firma, sus tres columnas quedan en nulo", async () => {
    const { saveWhatsappZernioCredentials } = await import(
      "@/server/whatsapp-zernio/credentials"
    );
    await saveWhatsappZernioCredentials({
      organizationId: "org_1",
      accountRef: "acc_1",
      displayPhoneNumber: null,
      verifiedName: null,
      token: LLAVE,
      webhookSecret: null,
    });
    const row = inserted[0]!;
    expect(row.webhookSecretCipher).toBeNull();
    expect(row.webhookSecretIv).toBeNull();
    expect(row.webhookSecretTag).toBeNull();
  });

  it("la fuente se llama zernio y nace conectada", async () => {
    const { saveWhatsappZernioCredentials } = await import(
      "@/server/whatsapp-zernio/credentials"
    );
    await saveWhatsappZernioCredentials({
      organizationId: "org_1",
      accountRef: "acc_1",
      displayPhoneNumber: null,
      verifiedName: null,
      token: LLAVE,
      webhookSecret: null,
    });
    expect(inserted[0]).toMatchObject({
      organizationId: "org_1",
      source: "zernio",
      accountRef: "acc_1",
      status: "connected",
    });
  });

  it("si ya había una fila de esa organización la actualiza y vuelve a «conectada»", async () => {
    const { saveWhatsappZernioCredentials } = await import(
      "@/server/whatsapp-zernio/credentials"
    );
    const { encryptSecret } = await import("@/lib/crypto");
    const vieja = encryptSecret("llave-vieja");
    filas = [
      {
        id: "cred_viejo",
        organizationId: "org_1",
        source: "zernio",
        accountRef: "acc_viejo",
        displayPhoneNumber: null,
        verifiedName: null,
        tokenCipher: vieja.cipher,
        tokenIv: vieja.iv,
        tokenTag: vieja.tag,
        webhookSecretCipher: null,
        webhookSecretIv: null,
        webhookSecretTag: null,
        status: "reconnect_required",
      },
    ];
    await saveWhatsappZernioCredentials({
      organizationId: "org_1",
      accountRef: "acc_nuevo",
      displayPhoneNumber: null,
      verifiedName: null,
      token: LLAVE,
      webhookSecret: null,
    });
    expect(inserted).toHaveLength(0);
    expect(updated[0]).toMatchObject({ accountRef: "acc_nuevo", status: "connected" });
    expect(JSON.stringify(updated[0])).not.toContain(LLAVE);
  });
});

describe("lectura de las credenciales", () => {
  async function filaCifrada(extra: Record<string, unknown> = {}) {
    const { encryptSecret } = await import("@/lib/crypto");
    const t = encryptSecret(LLAVE);
    const s = encryptSecret(SECRETO);
    return {
      id: "cred_1",
      organizationId: "org_1",
      source: "zernio",
      accountRef: "acc_1",
      displayPhoneNumber: "+56900000000",
      verifiedName: "Inmobiliaria de prueba",
      tokenCipher: t.cipher,
      tokenIv: t.iv,
      tokenTag: t.tag,
      webhookSecretCipher: s.cipher,
      webhookSecretIv: s.iv,
      webhookSecretTag: s.tag,
      status: "connected",
      ...extra,
    };
  }

  it("por organización: devuelve la llave y el secreto descifrados, solo en memoria", async () => {
    const { getWhatsappZernioCredentialsByOrg } = await import(
      "@/server/whatsapp-zernio/credentials"
    );
    filas = [await filaCifrada()];
    const c = await getWhatsappZernioCredentialsByOrg("org_1");
    expect(c).toMatchObject({
      id: "cred_1",
      organizationId: "org_1",
      source: "zernio",
      accountRef: "acc_1",
      token: LLAVE,
      webhookSecret: SECRETO,
      status: "connected",
    });
  });

  it("por cuenta de Zernio (el enrutado del webhook): la misma forma", async () => {
    const { getWhatsappZernioCredentialsByAccountRef } = await import(
      "@/server/whatsapp-zernio/credentials"
    );
    filas = [await filaCifrada()];
    const c = await getWhatsappZernioCredentialsByAccountRef("acc_1");
    expect(c?.organizationId).toBe("org_1");
    expect(c?.token).toBe(LLAVE);
  });

  it("sin fila, null (y no un error): la organización simplemente no usa esta fuente", async () => {
    const mod = await import("@/server/whatsapp-zernio/credentials");
    filas = [];
    expect(await mod.getWhatsappZernioCredentialsByOrg("org_1")).toBeNull();
    expect(await mod.getWhatsappZernioCredentialsByAccountRef("acc_x")).toBeNull();
  });

  it("sin secreto guardado, webhookSecret es null", async () => {
    const { getWhatsappZernioCredentialsByOrg } = await import(
      "@/server/whatsapp-zernio/credentials"
    );
    filas = [
      await filaCifrada({
        webhookSecretCipher: null,
        webhookSecretIv: null,
        webhookSecretTag: null,
      }),
    ];
    expect((await getWhatsappZernioCredentialsByOrg("org_1"))?.webhookSecret).toBeNull();
  });
});

describe("estado y baja", () => {
  it("markWhatsappZernioReconnectRequired pausa los envíos: pone el estado, nada más", async () => {
    const { markWhatsappZernioReconnectRequired } = await import(
      "@/server/whatsapp-zernio/credentials"
    );
    await markWhatsappZernioReconnectRequired("org_1");
    expect(updated[0]).toMatchObject({ status: "reconnect_required" });
    expect(Object.keys(updated[0]!)).not.toContain("tokenCipher");
  });

  it("deleteWhatsappZernioCredentials borra la fila de esa organización", async () => {
    const { deleteWhatsappZernioCredentials } = await import(
      "@/server/whatsapp-zernio/credentials"
    );
    await deleteWhatsappZernioCredentials("org_1");
    expect(deleted).toBe(1);
  });

  it("tokenLast4 enseña solo los últimos 4 caracteres", async () => {
    const { tokenLast4 } = await import("@/server/whatsapp-zernio/credentials");
    expect(tokenLast4(LLAVE)).toBe("abcd");
    expect(tokenLast4(LLAVE)).not.toContain("super");
  });
});
