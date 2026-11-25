"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { WhatsappWizard } from "@/components/settings/whatsapp-wizard";
import { WhatsappZernioClient } from "@/components/settings/whatsapp-zernio-client";

/**
 * 080 — Meta directo o «Por Zernio». Si la instancia no tiene la bandera
 * `WHATSAPP_ZERNIO`, la API responde 404 y esta pantalla es la de siempre:
 * ni un selector ni una palabra de más (ADR-001).
 */
type Fuente = "meta" | "zernio";

export function WhatsappSource() {
  const [disponible, setDisponible] = useState<boolean | null>(null);
  const [fuente, setFuente] = useState<Fuente>("meta");

  useEffect(() => {
    void fetch("/api/settings/whatsapp-zernio")
      .then(async (r) => {
        if (!r.ok) return setDisponible(false);
        const c = (await r.json().catch(() => null)) as { connection: unknown } | null;
        setDisponible(true);
        // Quien ya tiene su WhatsApp por Zernio entra viendo ese.
        if (c?.connection) setFuente("zernio");
      })
      .catch(() => setDisponible(false));
  }, []);

  if (!disponible) return <WhatsappWizard />;

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Cómo se conecta WhatsApp" className="flex gap-2">
        {(
          [
            ["meta", "Meta (directo)"],
            ["zernio", "Por Zernio"],
          ] as const
        ).map(([id, etiqueta]) => (
          <Button
            key={id}
            role="tab"
            aria-selected={fuente === id}
            variant={fuente === id ? "default" : "outline"}
            onClick={() => setFuente(id)}
          >
            {etiqueta}
          </Button>
        ))}
      </div>
      {fuente === "meta" ? <WhatsappWizard /> : <WhatsappZernioClient />}
    </div>
  );
}
