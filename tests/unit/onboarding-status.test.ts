import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * FR-005/FR-006/FR-009: cada paso se deriva de la configuración vigente
 * (no de un flag persistido), así que reflejar "se desconectó después de
 * estar conectado" es solo llamar la función dos veces con datos distintos.
 */

const dbState = vi.hoisted(() => ({
  selectQueue: [] as unknown[][],
  branding: { name: "Vocero", accent: "#3f5972", currency: "MXN", favicon: null as unknown },
}));

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

vi.mock("@/server/branding", () => ({
  getBranding: () => Promise.resolve(dbState.branding),
}));

beforeEach(() => {
  dbState.selectQueue = [];
  dbState.branding = { name: "Vocero", accent: "#3f5972", currency: "MXN", favicon: null };
});

import { getOnboardingStatus } from "@/server/onboarding/status";

describe("getOnboardingStatus", () => {
  it("todos los pasos pendientes → 0%", async () => {
    dbState.selectQueue.push(
      [], // metaCredentials: sin fila
      [{ enabled: false, tone: null, instructions: null }] // agentProfile
    );
    const status = await getOnboardingStatus("org_1");
    expect(status.percent).toBe(0);
    expect(status.completedCount).toBe(0);
    expect(status.steps.every((s) => !s.completed)).toBe(true);
  });

  it("WhatsApp conectado cuenta como completo", async () => {
    dbState.selectQueue.push(
      [{ status: "connected" }],
      [{ enabled: false, tone: null, instructions: null }]
    );
    const status = await getOnboardingStatus("org_1");
    const whatsapp = status.steps.find((s) => s.key === "whatsapp")!;
    expect(whatsapp.completed).toBe(true);
    expect(status.completedCount).toBe(1);
  });

  it("WhatsApp con status reconnect_required NO cuenta como completo", async () => {
    dbState.selectQueue.push(
      [{ status: "reconnect_required" }],
      [{ enabled: false, tone: null, instructions: null }]
    );
    const status = await getOnboardingStatus("org_1");
    const whatsapp = status.steps.find((s) => s.key === "whatsapp")!;
    expect(whatsapp.completed).toBe(false);
  });

  it("agente habilitado con tono cuenta como completo", async () => {
    dbState.selectQueue.push([], [{ enabled: true, tone: "Cercano", instructions: null }]);
    const status = await getOnboardingStatus("org_1");
    const agent = status.steps.find((s) => s.key === "agent")!;
    expect(agent.completed).toBe(true);
  });

  it("agente habilitado pero SIN tono ni instrucciones NO cuenta como completo", async () => {
    dbState.selectQueue.push([], [{ enabled: true, tone: null, instructions: "" }]);
    const status = await getOnboardingStatus("org_1");
    const agent = status.steps.find((s) => s.key === "agent")!;
    expect(agent.completed).toBe(false);
  });

  it("marca personalizada por nombre distinto del default cuenta como completo", async () => {
    dbState.selectQueue.push([], [{ enabled: false, tone: null, instructions: null }]);
    dbState.branding = { name: "Ferretería El Martillo", accent: "#3f5972", currency: "MXN", favicon: null };
    const status = await getOnboardingStatus("org_1");
    const branding = status.steps.find((s) => s.key === "branding")!;
    expect(branding.completed).toBe(true);
  });

  it("marca personalizada por favicon, con nombre aún por defecto, cuenta como completo", async () => {
    dbState.selectQueue.push([], [{ enabled: false, tone: null, instructions: null }]);
    dbState.branding = {
      name: "Vocero",
      accent: "#3f5972",
      currency: "MXN",
      favicon: { mime: "image/png", version: 1 },
    };
    const status = await getOnboardingStatus("org_1");
    const branding = status.steps.find((s) => s.key === "branding")!;
    expect(branding.completed).toBe(true);
  });

  it("los 3 pasos completos → 100%", async () => {
    dbState.selectQueue.push(
      [{ status: "connected" }],
      [{ enabled: true, tone: "Cercano", instructions: null }]
    );
    dbState.branding = { name: "Ferretería El Martillo", accent: "#3f5972", currency: "MXN", favicon: null };
    const status = await getOnboardingStatus("org_1");
    expect(status.percent).toBe(100);
    expect(status.completedCount).toBe(3);
  });

  it("desconectar WhatsApp tras estar conectado vuelve a marcarlo pendiente (sin estado persistido)", async () => {
    dbState.selectQueue.push(
      [{ status: "connected" }],
      [{ enabled: false, tone: null, instructions: null }]
    );
    const before = await getOnboardingStatus("org_1");
    expect(before.steps.find((s) => s.key === "whatsapp")!.completed).toBe(true);

    dbState.selectQueue.push([], [{ enabled: false, tone: null, instructions: null }]);
    const after = await getOnboardingStatus("org_1");
    expect(after.steps.find((s) => s.key === "whatsapp")!.completed).toBe(false);
  });
});
