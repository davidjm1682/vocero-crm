import { beforeEach, describe, expect, it, vi } from "vitest";

const chatJson = vi.fn();

vi.mock("@/lib/ai", () => ({
  chatJson: (...args: unknown[]) => chatJson(...args),
}));

import {
  buildConfigAssistantPrompt,
  generateConfigAssistantProposal,
} from "@/server/ai/config-assistant";

const ANSWERS = {
  canal: "WhatsApp Business",
  negocio: "Skincare artesanal por catálogo",
  tono: "Cercano y profesional",
  escalado: "Reembolsos o quejas de pedidos",
};

describe("buildConfigAssistantPrompt", () => {
  it("incluye las 4 respuestas en el mensaje de usuario", () => {
    const messages = buildConfigAssistantPrompt(ANSWERS);
    expect(messages).toHaveLength(2);
    expect(messages[0]!.role).toBe("system");
    expect(messages[1]!.role).toBe("user");
    expect(messages[1]!.content).toContain(ANSWERS.canal);
    expect(messages[1]!.content).toContain(ANSWERS.negocio);
    expect(messages[1]!.content).toContain(ANSWERS.tono);
    expect(messages[1]!.content).toContain(ANSWERS.escalado);
  });
});

describe("generateConfigAssistantProposal", () => {
  beforeEach(() => chatJson.mockReset());

  it("propaga una propuesta exitosa de chatJson", async () => {
    chatJson.mockResolvedValue({
      ok: true,
      data: {
        tone: "Cercano y profesional",
        instructions: "Responde dudas sobre productos de skincare...",
        escalationRules: "Escala ante solicitudes de reembolso o quejas",
      },
      raw: "{}",
    });
    const result = await generateConfigAssistantProposal("org_1", ANSWERS);
    expect(result.ok).toBe(true);
    expect(chatJson.mock.calls[0]![2]).toMatchObject({ organizationId: "org_1" });
    if (result.ok) {
      expect(result.data.tone).toContain("Cercano");
    }
  });

  it("propaga not_configured cuando no hay proveedor de IA", async () => {
    chatJson.mockResolvedValue({
      ok: false,
      error: "not_configured",
      detail: "Sin OPENROUTER_API_TOKEN configurado",
    });
    const result = await generateConfigAssistantProposal("org_1", ANSWERS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("not_configured");
    }
  });

  it("propaga provider_error cuando el proveedor falla tras reintentos", async () => {
    chatJson.mockResolvedValue({
      ok: false,
      error: "provider_error",
      detail: "timeout",
    });
    const result = await generateConfigAssistantProposal("org_1", ANSWERS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("provider_error");
    }
  });
});
