import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { getBranding } from "@/server/branding";

/**
 * 006 — Checklist de onboarding: el estado de cada paso se DERIVA en cada
 * consulta desde la configuración real (WhatsApp, agente, marca) — no se
 * persiste "completado" en ningún lado, así nunca se desincroniza si el
 * dueño deshace un paso (research.md, Decisión 1).
 */

export type OnboardingStepKey = "whatsapp" | "agent" | "branding";

export type OnboardingStep = {
  key: OnboardingStepKey;
  label: string;
  completed: boolean;
  href: string;
};

export type OnboardingStatus = {
  steps: OnboardingStep[];
  completedCount: number;
  totalCount: number;
  percent: number;
};

const STEP_META: Record<OnboardingStepKey, { label: string; href: string }> = {
  whatsapp: { label: "Conectar WhatsApp", href: "/settings/whatsapp" },
  agent: { label: "Configurar el agente de IA", href: "/agent" },
  branding: { label: "Personalizar tu marca", href: "/settings/branding" },
};

export async function getOnboardingStatus(
  organizationId: string
): Promise<OnboardingStatus> {
  const db = getDb();

  const [metaRows, agentRows, branding] = await Promise.all([
    db
      .select({ status: schema.metaCredentials.status })
      .from(schema.metaCredentials)
      .where(scoped(schema.metaCredentials.organizationId, organizationId))
      .limit(1),
    db
      .select({
        enabled: schema.agentProfile.enabled,
        tone: schema.agentProfile.tone,
        instructions: schema.agentProfile.instructions,
      })
      .from(schema.agentProfile)
      .where(scoped(schema.agentProfile.organizationId, organizationId))
      .limit(1),
    getBranding(organizationId),
  ]);

  const whatsappCompleted = metaRows[0]?.status === "connected";

  const agent = agentRows[0];
  const agentCompleted = Boolean(
    agent?.enabled && (agent.tone?.trim() || agent.instructions?.trim())
  );

  // Personalizado = nombre distinto del default "Vocero" O tiene favicon
  // propio (el logo del negocio, en la terminología de Settings → Marca).
  const brandingCompleted = branding.name !== "Vocero" || branding.favicon !== null;

  const steps: OnboardingStep[] = [
    { key: "whatsapp", ...STEP_META.whatsapp, completed: whatsappCompleted },
    { key: "agent", ...STEP_META.agent, completed: agentCompleted },
    { key: "branding", ...STEP_META.branding, completed: brandingCompleted },
  ];

  const completedCount = steps.filter((s) => s.completed).length;
  const totalCount = steps.length;

  return {
    steps,
    completedCount,
    totalCount,
    percent: Math.round((completedCount / totalCount) * 100),
  };
}
