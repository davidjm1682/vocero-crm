"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Answers = {
  canal: string;
  negocio: string;
  tono: string;
  escalado: string;
};

type Proposal = {
  tone: string;
  instructions: string;
  escalationRules: string;
};

const EMPTY_ANSWERS: Answers = { canal: "", negocio: "", tono: "", escalado: "" };

const STEPS: { key: keyof Answers; label: string; placeholder: string }[] = [
  {
    key: "canal",
    label: "¿Cuál es el canal principal por el que atiendes a tus clientes?",
    placeholder: "p. ej. WhatsApp Business, para consultas y pedidos",
  },
  {
    key: "negocio",
    label: "¿A qué se dedica tu negocio?",
    placeholder: "p. ej. Vendemos productos de skincare artesanal por catálogo",
  },
  {
    key: "tono",
    label: "¿Cómo quieres que suene el agente al escribir?",
    placeholder: "p. ej. Cercano y cálido, pero profesional, sin muchos emojis",
  },
  {
    key: "escalado",
    label: "¿Cuándo debe el agente pasar la conversación a una persona?",
    placeholder: "p. ej. Si preguntan por reembolsos o se quejan de un pedido",
  },
];

/**
 * 005 — Solo GENERA una propuesta editable; aplicarla reutiliza el
 * onApply del padre (que a su vez llama al PUT /api/agent/profile ya
 * existente). El asistente nunca escribe en la base de datos directamente.
 */
export function ConfigAssistantDialog({
  hasExistingContent,
  onCancel,
  onApply,
}: {
  hasExistingContent: boolean;
  onCancel: () => void;
  onApply: (proposal: Proposal) => Promise<void>;
}) {
  const [confirmedOverwrite, setConfirmedOverwrite] = useState(!hasExistingContent);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = STEPS[step];
  const isLastStep = step === STEPS.length - 1;

  async function generate() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/agent/config-assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(answers),
    }).catch(() => null);
    setLoading(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(
        data?.error?.message ??
          "El proveedor de IA no respondió correctamente. Intenta de nuevo."
      );
      return;
    }
    const data = (await res.json()) as { proposal: Proposal };
    setProposal(data.proposal);
  }

  async function apply() {
    if (!proposal) return;
    setApplying(true);
    await onApply(proposal);
    setApplying(false);
  }

  if (!confirmedOverwrite) {
    return (
      <Overlay onCancel={onCancel} label="Confirmar reconfiguración">
        <h3 className="mb-1 font-semibold">Esto reemplazará tu configuración actual</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Tu agente ya tiene tono, instrucciones o reglas de escalado
          definidos. Si continúas, el asistente generará contenido nuevo que
          sobrescribirá lo que tienes ahora — podrás revisarlo antes de
          aplicarlo.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={() => setConfirmedOverwrite(true)}>Continuar</Button>
        </div>
      </Overlay>
    );
  }

  if (proposal) {
    return (
      <Overlay onCancel={onCancel} label="Revisar propuesta del asistente">
        <h3 className="mb-1 flex items-center gap-2 font-semibold">
          <Sparkles className="h-4 w-4 text-primary" /> Propuesta generada
        </h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Revisa el contenido antes de aplicarlo. Podrás editarlo manualmente
          después.
        </p>
        <div className="max-h-[50vh] space-y-3 overflow-y-auto text-sm">
          <ProposalField label="Tono" value={proposal.tone} />
          <ProposalField label="Instrucciones" value={proposal.instructions} />
          <ProposalField label="Reglas de escalado" value={proposal.escalationRules} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={applying}>
            Descartar
          </Button>
          <Button onClick={() => void apply()} disabled={applying}>
            {applying ? "Aplicando…" : "Aplicar"}
          </Button>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay onCancel={onCancel} label="Asistente de configuración">
      <h3 className="mb-1 flex items-center gap-2 font-semibold">
        <Sparkles className="h-4 w-4 text-primary" /> Configurar con el asistente
      </h3>
      <p className="mb-4 text-xs text-muted-foreground">
        Pregunta {step + 1} de {STEPS.length}
      </p>
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="assistant-answer">
          {current!.label}
        </label>
        <Textarea
          id="assistant-answer"
          rows={3}
          placeholder={current!.placeholder}
          value={answers[current!.key]}
          onChange={(e) =>
            setAnswers({ ...answers, [current!.key]: e.target.value })
          }
        />
      </div>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={loading}>
          Cancelar
        </Button>
        {step > 0 && (
          <Button variant="outline" onClick={() => setStep(step - 1)} disabled={loading}>
            Atrás
          </Button>
        )}
        <Button
          disabled={!answers[current!.key].trim() || loading}
          onClick={() =>
            isLastStep ? void generate() : setStep(step + 1)
          }
        >
          {loading ? "Generando…" : isLastStep ? "Generar propuesta" : "Siguiente"}
        </Button>
      </div>
    </Overlay>
  );
}

function ProposalField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function Overlay({
  label,
  onCancel,
  children,
}: {
  label: string;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-label={label}
        className="w-full max-w-lg rounded-lg border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
