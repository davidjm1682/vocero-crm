"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
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

type ModelOption = {
  id: string;
  name: string;
  contextLength: number | null;
  vision: boolean;
  promptPricePerM: number | null;
  completionPricePerM: number | null;
};

/**
 * 023 — Conecta el proveedor de IA (OpenRouter-compatible) que usan el
 * agente in-process del CRM y el Laboratorio. Sin esta conexión, ambos caen
 * a OPENROUTER_API_TOKEN/MODEL configurado en la plataforma de hosting.
 */
export function AiProviderConnect() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);

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

  useEffect(() => {
    fetch("/api/settings/ai-provider/models")
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => setModels(res?.models ?? []))
      .catch(() => setModels([]));
  }, []);

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

      <ConnectForm
        existing={connection}
        models={models}
        onSaved={() => void refetch()}
      />
    </div>
  );
}

function ConnectForm({
  existing,
  models,
  onSaved,
}: {
  existing: Connection | null;
  models: ModelOption[];
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
            <ModelPicker
              id="ai-model"
              models={models}
              value={model}
              onChange={setModel}
              placeholder="Busca un modelo…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-judge-model">Modelo del juez (opcional)</Label>
            <ModelPicker
              id="ai-judge-model"
              models={models}
              value={judgeModel}
              onChange={setJudgeModel}
              placeholder="Igual al de arriba"
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

function formatPrice(perM: number | null): string | null {
  if (perM === null) return null;
  if (perM === 0) return "gratis";
  return `$${perM < 1 ? perM.toFixed(3) : perM.toFixed(2)}/M`;
}

function formatContext(len: number | null): string | null {
  if (!len) return null;
  if (len >= 1000) return `${Math.round(len / 1000)}K ctx`;
  return `${len} ctx`;
}

function ModelPicker({
  id,
  models,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  models: ModelOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => setQuery(value), [value]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const needle = query.trim().toLowerCase();
  const filtered = (
    needle
      ? models.filter(
          (m) =>
            m.id.toLowerCase().includes(needle) ||
            m.name.toLowerCase().includes(needle)
        )
      : models
  ).slice(0, 200);

  function pick(m: ModelOption) {
    setQuery(m.id);
    onChange(m.id);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown") setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const m = filtered[activeIndex];
      if (m) pick(m);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  useEffect(() => setActiveIndex(0), [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div ref={rootRef} className="relative">
      <Input
        id={id}
        placeholder={placeholder}
        value={query}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
      />
      {open && models.length > 0 && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
          <p className="border-b px-3 py-1.5 text-xs text-muted-foreground">
            {filtered.length === models.length
              ? `${models.length} modelos disponibles`
              : `${filtered.length} de ${models.length}`}
          </p>
          <ul ref={listRef} className="max-h-80 overflow-y-auto">
            {filtered.length === 0 && (
              <li className="px-3 py-3 text-sm text-muted-foreground">
                Sin coincidencias — puedes usar el texto tal cual.
              </li>
            )}
            {filtered.map((m, i) => {
              const promptPrice = formatPrice(m.promptPricePerM);
              const completionPrice = formatPrice(m.completionPricePerM);
              const ctx = formatContext(m.contextLength);
              return (
                <li key={m.id} data-index={i}>
                  <button
                    type="button"
                    className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm ${
                      i === activeIndex ? "bg-accent" : "hover:bg-accent"
                    }`}
                    onMouseEnter={() => setActiveIndex(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(m);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{m.name}</span>
                      {m.vision && (
                        <Badge variant="secondary" className="shrink-0">
                          visión
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span className="truncate">{m.id}</span>
                      {ctx && <span>· {ctx}</span>}
                      {promptPrice && (
                        <span>
                          · {promptPrice} in
                          {completionPrice ? ` / ${completionPrice} out` : ""}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {open && models.length === 0 && (
        <p className="absolute z-10 mt-1 w-full rounded-md border bg-popover p-2 text-xs text-muted-foreground shadow-md">
          No se pudo cargar el catálogo de OpenRouter — puedes escribir el
          identificador del modelo directamente.
        </p>
      )}
    </div>
  );
}
