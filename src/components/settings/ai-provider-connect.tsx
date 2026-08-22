"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";
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
  model: string;
  judgeModel: string | null;
  tokenLast4: string;
};

/**
 * 023 — Conecta el proveedor de IA (OpenRouter-compatible) que usan el
 * agente in-process del CRM y el Laboratorio. Sin esta conexión, ambos caen
 * a OPENROUTER_API_TOKEN/MODEL configurado en la plataforma de hosting.
 */
export function AiProviderConnect() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refetch = useCallback(async () => {
    const res = await fetch("/api/settings/ai-provider").then((r) =>
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
      {!connection && (
        <div className="flex items-start gap-2 rounded-lg border border-warning-soft bg-warning-tint p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" />
          <div>
            <p className="font-medium text-warning-text">
              Sin proveedor de IA conectado aquí.
            </p>
            <p className="text-warning-text opacity-80">
              El agente y el Laboratorio siguen usando
              OPENROUTER_API_TOKEN/MODEL si están configurados en la
              plataforma de hosting. Conectar aquí no es obligatorio.
            </p>
          </div>
        </div>
      )}

      {connection && (
        <div className="flex items-center gap-3 rounded-lg border border-success-soft bg-success-tint p-4">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-success-text">
              Modelo: {connection.model}
            </p>
            <p className="text-success-text opacity-80">
              {connection.judgeModel && (
                <>Juez: {connection.judgeModel} · </>
              )}
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
  const [token, setToken] = useState("");
  const [model, setModel] = useState(existing?.model ?? "");
  const [judgeModel, setJudgeModel] = useState(existing?.judgeModel ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const canSave = token.trim() && model.trim();

  async function save() {
    setSaving(true);
    setError(null);
    setSavedOk(false);
    const res = await fetch("/api/settings/ai-provider", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        model,
        judgeModel: judgeModel.trim() || null,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "No se pudo guardar la conexión");
      return;
    }
    setToken("");
    setSavedOk(true);
    onSaved();
  }

  async function disconnect() {
    setDisconnecting(true);
    await fetch("/api/settings/ai-provider", { method: "DELETE" }).catch(
      () => null
    );
    setDisconnecting(false);
    setModel("");
    setJudgeModel("");
    onSaved();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          {existing ? "Reconectar proveedor de IA" : "Conectar proveedor de IA"}
        </CardTitle>
        <CardDescription>
          Cualquier proveedor compatible con OpenRouter — el habitual es{" "}
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline"
          >
            openrouter.ai
          </a>
          . El token se valida contra el modelo elegido ANTES de guardarse y
          se almacena cifrado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="ai-token">Token de acceso</Label>
          <Input
            id="ai-token"
            type="password"
            placeholder={
              existing
                ? `Guardado (…${existing.tokenLast4}) — pega uno nuevo para cambiarlo`
                : "sk-or-..."
            }
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              setSavedOk(false);
            }}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ai-model">Modelo</Label>
            <Input
              id="ai-model"
              placeholder="anthropic/claude-sonnet-4.5"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-judge-model">Modelo del juez (opcional)</Label>
            <Input
              id="ai-judge-model"
              placeholder="anthropic/claude-haiku-4.5"
              value={judgeModel}
              onChange={(e) => setJudgeModel(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Solo lo usa el Laboratorio para calificar; vacío = usa el mismo
              modelo de arriba.
            </p>
          </div>
        </div>

        {savedOk && <p className="text-sm text-success">✓ Conexión guardada.</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          <Button disabled={!canSave || saving} onClick={() => void save()}>
            {saving ? "Validando y guardando…" : "Guardar conexión"}
          </Button>
          {existing && (
            <Button
              variant="outline"
              disabled={disconnecting}
              onClick={() => void disconnect()}
            >
              {disconnecting ? "Desconectando…" : "Desconectar"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
