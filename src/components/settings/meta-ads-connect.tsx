"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Connection = {
  datasetId: string;
  status: "connected" | "reconnect_required";
  tokenLast4: string;
};

/**
 * 021 — Conecta el Pixel/Dataset de Meta Ads para reportar conversiones
 * (Conversions API) cuando un lead entra a una etapa marcada en el Pipeline.
 * Independiente de la conexión de WhatsApp (Configuración → WhatsApp).
 */
export function MetaAdsConnect() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/settings/meta-ads").then((r) =>
      r.ok ? r.json() : null
    );
    setConnection(res?.connection ?? null);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  if (!loaded) {
    return <p className="text-sm text-muted-foreground">Cargando…</p>;
  }

  return (
    <div className="max-w-3xl space-y-6">
      {connection?.status === "reconnect_required" && (
        <div className="flex items-start gap-2 rounded-lg border border-danger-soft bg-danger-tint p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-danger-text">
              El token de Meta Ads expiró o fue revocado.
            </p>
            <p className="text-danger-text opacity-80">
              Los reportes de conversión están en pausa. Pega un token nuevo
              abajo para reconectar.
            </p>
          </div>
        </div>
      )}

      {connection && connection.status === "connected" && (
        <div className="flex items-center gap-3 rounded-lg border border-success-soft bg-success-tint p-4">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-success-text">
              Dataset conectado: {connection.datasetId}
            </p>
            <p className="text-success-text opacity-80">
              token …{connection.tokenLast4}
            </p>
          </div>
          <Badge variant="success">Conectado</Badge>
        </div>
      )}

      <ConnectForm existing={connection} onSaved={() => void refetch()} />
    </div>
  );
}

function ConnectForm({
  existing,
  onSaved,
}: {
  existing: Connection | null;
  onSaved: () => void;
}) {
  const [datasetId, setDatasetId] = useState(existing?.datasetId ?? "");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  const canSave = datasetId.trim() && token.trim();

  async function save() {
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    const res = await fetch("/api/settings/meta-ads", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ datasetId, token }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setSaveError(data?.error?.message ?? "No se pudo guardar la conexión");
      return;
    }
    setToken("");
    setSaveOk(true);
    onSaved();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="h-4 w-4" />
          {existing ? "Reconectar Meta Ads" : "Conectar Meta Ads"}
        </CardTitle>
        <CardDescription>
          Cuando un lead entra a una etapa marcada &quot;Reportar a Meta
          Ads&quot; en el Pipeline, se reporta esa conversión a este
          Pixel/Dataset — así las campañas optimizan hacia leads que sí
          califican, no solo hacia quien contestó el primer mensaje. El
          token se valida ANTES de guardarse y se almacena cifrado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="dataset-id">Pixel ID / Dataset ID</Label>
          <Input
            id="dataset-id"
            placeholder="ID del Pixel o Dataset de Meta Ads"
            value={datasetId}
            onChange={(e) => setDatasetId(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ads-token">Token de acceso</Label>
          <Input
            id="ads-token"
            type="password"
            placeholder={
              existing
                ? `Guardado (…${existing.tokenLast4}) — pega uno nuevo para cambiarlo`
                : "Token de sistema con permiso ads_management"
            }
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              setSaveOk(false);
            }}
          />
          <p className="text-xs text-muted-foreground">
            Genera un token de usuario del sistema en Meta Business Suite →
            Configuración del negocio → Usuarios del sistema, con acceso al
            Pixel/Dataset y permiso <code>ads_management</code>.
          </p>
        </div>

        {saveOk && (
          <p className="text-sm text-success">✓ Conexión guardada.</p>
        )}
        {saveError && <p className="text-sm text-destructive">{saveError}</p>}

        <Button disabled={!canSave || saving} onClick={() => void save()}>
          {saving ? "Validando y guardando…" : "Guardar conexión"}
        </Button>
      </CardContent>
    </Card>
  );
}
