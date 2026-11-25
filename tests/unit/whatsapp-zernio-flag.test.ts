import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseWhatsappZernioFlag,
  whatsappZernioDisabledResponse,
  whatsappZernioEnabled,
} from "@/server/whatsapp-zernio/flag";
import { healthFeatures } from "@/server/health";

/**
 * 080 — WhatsApp por Zernio es un conector opcional (ADR-001, Principio II):
 * apagado por defecto, y apagado no existe para el usuario.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("WHATSAPP_ZERNIO: la bandera de despliegue (080 · D2)", () => {
  it("sin la variable, o vacía, está apagada", () => {
    expect(parseWhatsappZernioFlag(undefined)).toBe(false);
    expect(parseWhatsappZernioFlag("")).toBe(false);
    expect(parseWhatsappZernioFlag("   ")).toBe(false);
  });

  it("se enciende con los mismos valores que las otras banderas, con espacios y mayúsculas", () => {
    for (const valor of ["on", "ON", " On ", "1", "true", "si", "sí", "yes"]) {
      expect(parseWhatsappZernioFlag(valor), valor).toBe(true);
    }
  });

  it("cualquier otra cosa la deja apagada: un error de tipeo no enciende un conector", () => {
    for (const valor of ["off", "0", "false", "no", "onn", "zernio", "whatsapp"]) {
      expect(parseWhatsappZernioFlag(valor), valor).toBe(false);
    }
  });

  it("whatsappZernioEnabled() lee process.env directo, sin pasar por el validador de todo el entorno", () => {
    expect(whatsappZernioEnabled()).toBe(false);
    vi.stubEnv("WHATSAPP_ZERNIO", "on");
    expect(whatsappZernioEnabled()).toBe(true);
    vi.stubEnv("WHATSAPP_ZERNIO", "off");
    expect(whatsappZernioEnabled()).toBe(false);
  });

  it("una superficie apagada responde 404 sin cuerpo, no 403: no hay nada que revelar", async () => {
    const res = whatsappZernioDisabledResponse();
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
  });

  it("/api/health dice si está encendida y, apagada, dice false", () => {
    expect(healthFeatures({}).whatsappZernio).toBe(false);
    expect(healthFeatures({ WHATSAPP_ZERNIO: "off" }).whatsappZernio).toBe(false);
    expect(healthFeatures({ WHATSAPP_ZERNIO: "on" }).whatsappZernio).toBe(true);
  });

  it("encender WhatsApp por Zernio no enciende ni apaga ningún otro canal", () => {
    const a = healthFeatures({ CHANNELS: "instagram" });
    const b = healthFeatures({ CHANNELS: "instagram", WHATSAPP_ZERNIO: "on" });
    expect(b.channels).toEqual(a.channels);
    expect(b.agenda).toBe(a.agenda);
    expect(b.atribucion).toBe(a.atribucion);
  });
});
