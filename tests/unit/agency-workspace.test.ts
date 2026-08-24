import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * FR-009/FR-010: createAgencyWorkspace respeta el límite de plan y siembra
 * pipeline + agentProfile; un workspace archivado no cuenta contra el plan.
 */

const dbState = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  inserted: [] as Record<string, unknown>[][],
  updateReturningQueue: [] as unknown[][],
}));

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  const selectBuilder: Record<string, unknown> = {};
  for (const m of ["select", "from", "where", "limit"]) {
    selectBuilder[m] = () => selectBuilder;
  }
  (selectBuilder as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    resolve(dbState.selectQueue.shift() ?? []);

  const updateBuilder: Record<string, unknown> = {};
  for (const m of ["set", "where"]) {
    updateBuilder[m] = () => updateBuilder;
  }
  updateBuilder.returning = () =>
    Promise.resolve(dbState.updateReturningQueue.shift() ?? []);

  return {
    ...actual,
    getDb: () => ({
      select: () => selectBuilder,
      insert: () => ({
        values: (v: Record<string, unknown> | Record<string, unknown>[]) => {
          dbState.inserted.push(Array.isArray(v) ? v : [v]);
          return Promise.resolve();
        },
      }),
      update: () => updateBuilder,
    }),
  };
});

vi.mock("@/lib/db/ids", () => ({
  newId: (kind: string) => `${kind}_${Math.random().toString(36).slice(2, 8)}`,
}));

beforeEach(() => {
  dbState.selectQueue = [];
  dbState.inserted = [];
  dbState.updateReturningQueue = [];
  vi.resetModules();
});

describe("createAgencyWorkspace", () => {
  it("crea el workspace, siembra pipeline y agentProfile dentro del límite", async () => {
    const { createAgencyWorkspace } = await import("@/server/agency/credentials");
    // Orden de selects dentro de createAgencyWorkspace:
    // 1) agency por id, 2) count de workspaces activos (countActiveWorkspaces),
    // 3) select de orgs para grantAgencyMembersToWorkspace.
    dbState.selectQueue.push(
      [{ id: "agency_1", name: "Agencia Test", plan: "starter", planLimit: 2 }],
      [{ n: 0 }],
      []
    );
    const ws = await createAgencyWorkspace("agency_1", "Cliente Uno");
    expect(ws.name).toBe("Cliente Uno");
    const orgInsert = dbState.inserted.find((rows) => rows[0]?.agencyId === "agency_1");
    expect(orgInsert).toBeTruthy();
    // pipelineStage (5 filas sembradas) + agentProfile (1 fila)
    expect(dbState.inserted.some((rows) => rows.length === 5)).toBe(true);
    expect(
      dbState.inserted.some((rows) => rows.length === 1 && "organizationId" in rows[0]!)
    ).toBe(true);
  });

  it("rechaza con PlanLimitReachedError al llegar al límite exacto del plan", async () => {
    const { createAgencyWorkspace, PlanLimitReachedError } = await import(
      "@/server/agency/credentials"
    );
    dbState.selectQueue.push(
      [{ id: "agency_1", name: "Agencia Test", plan: "starter", planLimit: 2 }],
      [{ n: 2 }]
    );
    await expect(createAgencyWorkspace("agency_1", "Cliente Tres")).rejects.toThrow(
      PlanLimitReachedError
    );
  });
});

describe("countActiveWorkspaces", () => {
  it("devuelve el conteo de la query (workspaces activos no archivados)", async () => {
    const { countActiveWorkspaces } = await import("@/server/agency/credentials");
    dbState.selectQueue.push([{ n: 3 }]);
    const used = await countActiveWorkspaces("agency_1");
    expect(used).toBe(3);
  });
});

describe("archiveAgencyWorkspace", () => {
  it("devuelve true y setea archivedAt cuando el workspace pertenece a la agencia", async () => {
    const { archiveAgencyWorkspace } = await import("@/server/agency/credentials");
    dbState.updateReturningQueue.push([{ id: "org_1" }]);
    const ok = await archiveAgencyWorkspace("agency_1", "org_1");
    expect(ok).toBe(true);
  });

  it("devuelve false cuando el workspace no pertenece a la agencia (0 filas afectadas)", async () => {
    const { archiveAgencyWorkspace } = await import("@/server/agency/credentials");
    dbState.updateReturningQueue.push([]);
    const ok = await archiveAgencyWorkspace("agency_1", "org_de_otra_agencia");
    expect(ok).toBe(false);
  });
});
