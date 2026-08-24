"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  Building2,
  CheckCircle2,
  Plus,
  XCircle,
} from "lucide-react";
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

type Agency = {
  id: string;
  name: string;
  plan: "starter" | "growth" | "scale";
  planLimit: number;
  activeWorkspaces: number;
};

type Workspace = {
  id: string;
  name: string;
  whatsappConnected: boolean;
};

const PLAN_LABELS: Record<Agency["plan"], string> = {
  starter: "Starter",
  growth: "Growth",
  scale: "Scale",
};

export function AgencyClient() {
  const router = useRouter();
  const [agency, setAgency] = useState<Agency | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const [agencyRes, wsRes] = await Promise.all([
      fetch("/api/agency").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/agency/workspaces").then((r) => (r.ok ? r.json() : null)),
    ]).catch(() => [null, null]);
    setAgency(agencyRes?.agency ?? null);
    setWorkspaces(wsRes?.workspaces ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function enterWorkspace(id: string) {
    const res = await fetch(`/api/agency/workspaces/${id}/enter`, {
      method: "POST",
    }).catch(() => null);
    if (!res?.ok) {
      setError("No se pudo entrar a ese workspace");
      return;
    }
    router.push("/inbox");
    router.refresh();
  }

  async function archiveWorkspace(id: string) {
    if (!confirm("¿Archivar este cliente? Sus datos se conservan, pero deja de contar en tu plan.")) {
      return;
    }
    const res = await fetch(`/api/agency/workspaces/${id}/archive`, {
      method: "POST",
    }).catch(() => null);
    if (!res?.ok) {
      setError("No se pudo archivar el workspace");
      return;
    }
    void refetch();
  }

  if (!loaded) {
    return <p className="p-6 text-sm text-muted-foreground">Cargando…</p>;
  }

  if (!agency) {
    return (
      <div className="m-6 rounded-lg border p-8 text-center text-sm text-muted-foreground">
        Tu organización no pertenece a ninguna agencia.
      </div>
    );
  }

  const atLimit = agency.activeWorkspaces >= agency.planLimit;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-6 sm:py-4">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Building2 className="h-4 w-4 text-primary" /> {agency.name}
          </h2>
          <p className="text-xs text-muted-foreground">
            Plan {PLAN_LABELS[agency.plan]} · {agency.activeWorkspaces} de{" "}
            {agency.planLimit} clientes
          </p>
        </div>
      </header>

      {error && <p className="px-4 pt-3 text-sm text-destructive sm:px-6">{error}</p>}

      <div className="space-y-4 p-4 sm:p-6">
        <NewWorkspaceForm
          agencyName={PLAN_LABELS[agency.plan]}
          atLimit={atLimit}
          planLimit={agency.planLimit}
          onCreated={() => void refetch()}
          onError={setError}
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Sin clientes todavía. Agrega el primero arriba.
            </p>
          )}
          {workspaces.map((ws) => (
            <Card key={ws.id}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base">
                  {ws.name}
                  {ws.whatsappConnected ? (
                    <Badge variant="success" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Conectado
                    </Badge>
                  ) : (
                    <Badge variant="warning" className="gap-1">
                      <XCircle className="h-3 w-3" /> Sin WhatsApp
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => void enterWorkspace(ws.id)}
                >
                  Gestionar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="Archivar cliente"
                  onClick={() => void archiveWorkspace(ws.id)}
                >
                  <Archive className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function NewWorkspaceForm({
  atLimit,
  planLimit,
  agencyName,
  onCreated,
  onError,
}: {
  atLimit: boolean;
  planLimit: number;
  agencyName: string;
  onCreated: () => void;
  onError: (msg: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setSaving(true);
    onError(null);
    const res = await fetch("/api/agency/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      onError(data?.error?.message ?? "No se pudo agregar el cliente");
      return;
    }
    setName("");
    setOpen(false);
    onCreated();
  }

  if (!open) {
    return (
      <div>
        <Button
          onClick={() => setOpen(true)}
          disabled={atLimit}
          title={
            atLimit
              ? `Alcanzaste el límite de ${planLimit} clientes de tu plan ${agencyName}. Sube de plan para agregar más.`
              : undefined
          }
        >
          <Plus className="h-4 w-4" /> Agregar cliente
        </Button>
        {atLimit && (
          <p className="mt-2 text-xs text-warning-text">
            Alcanzaste el límite de {planLimit} clientes de tu plan {agencyName}. Sube de
            plan para agregar más.
          </p>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nuevo cliente</CardTitle>
        <CardDescription>
          Crea el workspace; luego conecta el WhatsApp de este cliente desde su panel.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="ws-name">Nombre del cliente</Label>
          <Input
            id="ws-name"
            placeholder="Clínica Dental Sonrisa"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button disabled={!name.trim() || saving} onClick={() => void create()}>
            {saving ? "Creando…" : "Crear"}
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
