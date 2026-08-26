"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Circle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type OnboardingStep = {
  key: string;
  label: string;
  completed: boolean;
  href: string;
};

type OnboardingStatus = {
  steps: OnboardingStep[];
  completedCount: number;
  totalCount: number;
  percent: number;
};

/**
 * 006 — Se muestra mientras falte algún paso esencial; el estado siempre se
 * recalcula al montar (nunca se cachea entre navegaciones), así refleja
 * cambios hechos en cualquier otra pantalla sin necesitar invalidación.
 */
export function OnboardingChecklist({
  alwaysShow = false,
}: {
  /** true = mostrar aunque el progreso ya sea 100% (vista completa bajo demanda). */
  alwaysShow?: boolean;
}) {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);

  useEffect(() => {
    fetch("/api/onboarding")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: OnboardingStatus | null) => setStatus(data))
      .catch(() => setStatus(null));
  }, []);

  if (!status) return null;
  if (!alwaysShow && status.percent >= 100) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Construyamos tu negocio en Vocero</CardTitle>
        <CardDescription>
          Completa estos pasos para que el CRM y el agente de IA estén
          listos para atender a tus clientes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${status.percent}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {status.completedCount} de {status.totalCount} completados ·{" "}
            {status.percent}%
          </p>
        </div>
        <ul className="space-y-2">
          {status.steps.map((step) => (
            <li key={step.key}>
              {step.completed ? (
                <span className="flex items-center gap-2 rounded-md border border-success-soft bg-success-tint px-3 py-2 text-sm text-success-text">
                  <Check className="h-4 w-4 shrink-0" />
                  {step.label}
                </span>
              ) : (
                <Link
                  href={step.href}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-subtle"
                >
                  <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {step.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
