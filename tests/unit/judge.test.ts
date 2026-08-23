import { beforeEach, describe, expect, it, vi } from "vitest";

const chatJson = vi.fn();

vi.mock("@/lib/ai", () => ({
  chatJson: (...args: unknown[]) => chatJson(...args),
}));

import { computeScore, judgeCase, summarizeRun } from "@/server/lab/judge";

describe("judgeCase (FR-032)", () => {
  beforeEach(() => chatJson.mockReset());

  it("veredicto válido → done", async () => {
    chatJson.mockResolvedValue({
      ok: true,
      data: { veredicto: "verde", hallazgos: [] },
      raw: "{}",
    });
    const outcome = await judgeCase({
      organizationId: "org_1",
      personaKey: "comprador_decidido",
      transcript: [{ role: "cliente", text: "hola" }],
      kbText: "kb",
      behaviorText: "b",
    });
    expect(outcome.status).toBe("done");
    // usa el modelo del juez (opts.judge)
    expect(chatJson.mock.calls[0]![2]).toMatchObject({ judge: true });
  });

  it("salida inválida tras reintentos internos → judge_failed (no lanza)", async () => {
    chatJson.mockResolvedValue({
      ok: false,
      error: "invalid_output",
      detail: "no cumple el esquema (raw=...)",
    });
    const outcome = await judgeCase({
      organizationId: "org_1",
      personaKey: "fuera_de_kb",
      transcript: [],
      kbText: "",
      behaviorText: "",
    });
    expect(outcome.status).toBe("judge_failed");
  });
});

describe("summarizeRun", () => {
  beforeEach(() => chatJson.mockReset());

  it("resumen válido → lo devuelve", async () => {
    chatJson.mockResolvedValue({
      ok: true,
      data: { resumen: "El agente alucinó precios en 2 de 6 casos." },
      raw: "{}",
    });
    const summary = await summarizeRun({
      organizationId: "org_1",
      score: 60,
      previousScore: 80,
      cases: [
        { personaLabel: "Comprador decidido", veredicto: "verde", hallazgos: null },
      ],
    });
    expect(summary).toBe("El agente alucinó precios en 2 de 6 casos.");
  });

  it("falla el proveedor → null (no lanza, no bloquea la corrida)", async () => {
    chatJson.mockResolvedValue({
      ok: false,
      error: "invalid_output",
      detail: "no cumple el esquema",
    });
    const summary = await summarizeRun({
      organizationId: "org_1",
      score: null,
      previousScore: null,
      cases: [],
    });
    expect(summary).toBeNull();
  });
});

describe("computeScore (FR-033: judge_failed excluido del denominador)", () => {
  it("pondera verde=1, amarillo=0.5, rojo=0", () => {
    const score = computeScore([
      { status: "done", veredicto: "verde" },
      { status: "done", veredicto: "amarillo" },
      { status: "done", veredicto: "rojo" },
    ]);
    expect(score).toBe(50); // (1 + 0.5 + 0) / 3 = 0.5
  });

  it("judge_failed NO cuenta en el denominador", () => {
    const score = computeScore([
      { status: "done", veredicto: "verde" },
      { status: "done", veredicto: "verde" },
      { status: "judge_failed", veredicto: null },
    ]);
    expect(score).toBe(100); // 2/2, no 2/3
  });

  it("todo judge_failed → sin score (null)", () => {
    expect(
      computeScore([{ status: "judge_failed", veredicto: null }])
    ).toBeNull();
  });

  it("6 verdes → 100; 6 rojos → 0", () => {
    const verdes = Array(6).fill({ status: "done", veredicto: "verde" });
    const rojos = Array(6).fill({ status: "done", veredicto: "rojo" });
    expect(computeScore(verdes)).toBe(100);
    expect(computeScore(rojos)).toBe(0);
  });
});
