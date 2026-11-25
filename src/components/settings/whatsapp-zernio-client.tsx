"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ZernioConnect } from "@/components/settings/zernio-connect";

/**
 * 080 — Conexión del WhatsApp del negocio por SU cuenta de Zernio.
 *
 * Cada negocio usa su propia cuenta y su propia llave de Zernio: Vocero no
 * pone la suya. La llave se prueba contra Zernio ANTES de guardar, se cifra, y
 * hacia fuera solo se enseña su cola. Solo una fuente a la vez: con Meta
 * conectado hay que desconectarlo primero (el servidor lo dice con un 409).
 */

type Connection = {
  accountRef: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  status: "connected" | "reconnect_required";
  tokenLast4: string;
  hasWebhookSecret: boolean;
};

const PASOS = [
  "El número de WhatsApp se conecta en tu panel de Zernio (Accounts → Connect), no desde aquí.",
  "La API key se crea en Zernio → Settings → API Keys y se muestra una sola vez (empieza con sk_).",
];

const REGLAS = [
  "Los mensajes, las fotos, los audios, las ubicaciones y los contactos de tus clientes entran a la misma bandeja.",
  "Puedes contestar con texto, archivos, ubicación y contactos, y citando un mensaje, mientras el cliente haya escrito en las últimas 24 horas.",
  "Las plantillas para reabrir una conversación todavía no están disponibles por Zernio: pasadas las 24 horas hay que esperar a que el cliente vuelva a escribir.",
];

export function WhatsappZernioClient() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const c = await fetch("/api/settings/whatsapp-zernio")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (c) setConnection(c.connection);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function disconnect() {
    if (
      !window.confirm(
        "¿Desconectar WhatsApp de Zernio? Dejarás de recibir y enviar por aquí. Los mensajes ya guardados se conservan."
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/settings/whatsapp-zernio", { method: "DELETE" }).catch(
      () => null
    );
    setBusy(false);
    if (!res?.ok) {
      setError("No se pudo desconectar. Intenta de nuevo.");
      return;
    }
    await refetch();
  }

  if (!loaded) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  return (
    <div className="max-w-3xl space-y-6">
      {connection?.status === "reconnect_required" && (
        <div className="flex items-start gap-2 rounded-lg border border-danger-soft bg-danger-tint p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-danger-text">
              La API key de Zernio expiró o fue revocada.
            </p>
            <p className="text-danger-text opacity-80">
              Los envíos por WhatsApp están pausados. Pega una nueva abajo para
              reconectar.
            </p>
          </div>
        </div>
      )}

      {connection?.status === "connected" && (
        <div className="flex items-center gap-3 rounded-lg border border-success-soft bg-success-tint p-4">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-success-text">
              Conectado por Zernio
              {connection.displayPhoneNumber ? `: ${connection.displayPhoneNumber}` : ""}
            </p>
            <p className="text-success-text opacity-80">
              Cuenta {connection.accountRef} · llave que termina en ····
              {connection.tokenLast4}
              {connection.hasWebhookSecret ? " · firma del webhook activa" : ""}
            </p>
          </div>
          <Badge variant="success">WhatsApp activo</Badge>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Lo que puedes hacer por Zernio</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-text-2">
            {REGLAS.map((regla, i) => (
              <li key={i}>{regla}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {connection ? "Reconectar WhatsApp por Zernio" : "Conectar WhatsApp por Zernio"}
          </CardTitle>
          <CardDescription>
            Llega por tu propia cuenta de Zernio. Si ya conectaste WhatsApp
            directo con Meta, desconéctalo antes: un negocio usa una sola
            fuente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="list-disc space-y-1 pl-5 text-xs text-text-2">
            {PASOS.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>

          <ZernioConnect
            endpoint="/api/settings/whatsapp-zernio"
            what="tu número de WhatsApp"
            idPrefix="wa"
            onSaved={() => void refetch()}
          />
        </CardContent>
      </Card>

      {connection && (
        <Card>
          <CardHeader>
            <CardTitle>Desconectar</CardTitle>
            <CardDescription>
              Quita la llave de Zernio de esta instancia. Los mensajes guardados
              no se borran.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button variant="outline" onClick={() => void disconnect()} disabled={busy}>
              {busy ? "Desconectando…" : "Desconectar WhatsApp de Zernio"}
            </Button>
          </CardContent>
        </Card>
      )}

      <p className="flex items-start gap-2 text-xs text-text-2">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          El webhook lo da de alta Vocero en tu Zernio al conectar, limitado a
          tu cuenta.
        </span>
      </p>
    </div>
  );
}
