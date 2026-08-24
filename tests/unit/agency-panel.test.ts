import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * FR-007/FR-011: listAgencyWorkspaces solo devuelve workspaces activos de la
 * agencia correcta; getAgencyForUser devuelve null para un usuario sin agencia.
 */

const dbState = vi.hoisted(() => ({ selectQueue: [] as unknown[][] }));

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  const selectBuilder: Record<string, unknown> = {};
  for (const m of ["select", "from", "where", "limit"]) {
    selectBuilder[m] = () => selectBuilder;
  }
  (selectBuilder as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    resolve(dbState.selectQueue.shift() ?? []);
  return { ...actual, getDb: () => ({ select: () => selectBuilder }) };
});

beforeEach(() => {
  dbState.selectQueue = [];
  vi.resetModules();
});

describe("getAgencyForUser", () => {
  it("devuelve null cuando la organización no tiene agencyId", async () => {
    const { getAgencyForUser } = await import("@/server/agency/credentials");
    dbState.selectQueue.push([{ agencyId: null }]);
    const agency = await getAgencyForUser("org_1");
    expect(agency).toBeNull();
  });

  it("devuelve los datos de la agencia con el conteo de workspaces activos", async () => {
    const { getAgencyForUser } = await import("@/server/agency/credentials");
    dbState.selectQueue.push(
      [{ agencyId: "agency_1" }],
      [{ id: "agency_1", name: "Agencia Test", plan: "growth", planLimit: 15 }],
      [{ n: 4 }]
    );
    const agency = await getAgencyForUser("org_1");
    expect(agency).toEqual({
      id: "agency_1",
      name: "Agencia Test",
      plan: "growth",
      planLimit: 15,
      activeWorkspaces: 4,
    });
  });
});

describe("listAgencyWorkspaces", () => {
  it("marca whatsappConnected según las credenciales existentes", async () => {
    const { listAgencyWorkspaces } = await import("@/server/agency/credentials");
    dbState.selectQueue.push(
      [
        { id: "org_1", name: "Cliente Uno" },
        { id: "org_2", name: "Cliente Dos" },
      ],
      [{ organizationId: "org_1" }]
    );
    const list = await listAgencyWorkspaces("agency_1");
    expect(list).toEqual([
      { id: "org_1", name: "Cliente Uno", whatsappConnected: true },
      { id: "org_2", name: "Cliente Dos", whatsappConnected: false },
    ]);
  });

  it("devuelve lista vacía sin consultar credenciales si no hay workspaces", async () => {
    const { listAgencyWorkspaces } = await import("@/server/agency/credentials");
    dbState.selectQueue.push([]);
    const list = await listAgencyWorkspaces("agency_1");
    expect(list).toEqual([]);
  });
});
