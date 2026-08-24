import { and, count, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { grantAgencyMembersToWorkspace } from "@/server/agency/members";

/**
 * 004 — Dominio de agencia: agrupa el acceso administrativo a N workspaces
 * de cliente (organization), cada uno tan aislado como cualquier organización
 * hoy. La agencia nunca es un tenant de datos de dominio en sí misma.
 */

const SEED_STAGES: { name: string; kind: "open" | "won" | "lost" }[] = [
  { name: "Nuevo", kind: "open" },
  { name: "En conversación", kind: "open" },
  { name: "Interesado", kind: "open" },
  { name: "Cliente", kind: "won" },
  { name: "Perdido", kind: "lost" },
];

export type AgencySummary = {
  id: string;
  name: string;
  plan: "starter" | "growth" | "scale";
  planLimit: number;
  activeWorkspaces: number;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  whatsappConnected: boolean;
};

/** Agencia del usuario a partir de su organización activa (null si no aplica). */
export async function getAgencyForUser(
  organizationId: string
): Promise<AgencySummary | null> {
  const db = getDb();
  const orgs = await db
    .select({ agencyId: schema.organization.agencyId })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1);
  const agencyId = orgs[0]?.agencyId;
  if (!agencyId) return null;

  const agencies = await db
    .select()
    .from(schema.agency)
    .where(eq(schema.agency.id, agencyId))
    .limit(1);
  const ag = agencies[0];
  if (!ag) return null;

  return {
    id: ag.id,
    name: ag.name,
    plan: ag.plan,
    planLimit: ag.planLimit,
    activeWorkspaces: await countActiveWorkspaces(ag.id),
  };
}

/** Workspaces activos (no archivados) de una agencia. */
export async function countActiveWorkspaces(agencyId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: count() })
    .from(schema.organization)
    .where(
      and(
        eq(schema.organization.agencyId, agencyId),
        isNull(schema.organization.archivedAt)
      )
    );
  return row?.n ?? 0;
}

export class PlanLimitReachedError extends Error {}

/**
 * Crea un workspace de cliente nuevo dentro del límite del plan de la
 * agencia: siembra pipeline + agentProfile (mismo patrón que el alta de la
 * primera organización de la instancia) y da acceso a todos los miembros
 * actuales de la agencia.
 */
export async function createAgencyWorkspace(
  agencyId: string,
  name: string
): Promise<{ id: string; name: string }> {
  const db = getDb();

  const agencies = await db
    .select()
    .from(schema.agency)
    .where(eq(schema.agency.id, agencyId))
    .limit(1);
  const ag = agencies[0];
  if (!ag) throw new Error("Agencia no encontrada");

  const used = await countActiveWorkspaces(agencyId);
  if (used >= ag.planLimit) {
    throw new PlanLimitReachedError(
      `Alcanzaste el límite de ${ag.planLimit} clientes de tu plan ${planLabel(ag.plan)}. Sube de plan para agregar más.`
    );
  }

  const orgId = newId("organization");
  await db.insert(schema.organization).values({
    id: orgId,
    name,
    agencyId,
  });
  await db.insert(schema.pipelineStage).values(
    SEED_STAGES.map((s, i) => ({
      id: newId("stage"),
      organizationId: orgId,
      name: s.name,
      position: i,
      kind: s.kind,
    }))
  );
  await db.insert(schema.agentProfile).values({
    id: newId("agentProfile"),
    organizationId: orgId,
  });

  await grantAgencyMembersToWorkspace(agencyId, orgId);

  return { id: orgId, name };
}

/** Lista los workspaces activos de una agencia con estado de conexión de WhatsApp. */
export async function listAgencyWorkspaces(
  agencyId: string
): Promise<WorkspaceSummary[]> {
  const db = getDb();
  const orgs = await db
    .select({ id: schema.organization.id, name: schema.organization.name })
    .from(schema.organization)
    .where(
      and(
        eq(schema.organization.agencyId, agencyId),
        isNull(schema.organization.archivedAt)
      )
    );
  if (orgs.length === 0) return [];

  const creds = await db
    .select({ organizationId: schema.metaCredentials.organizationId })
    .from(schema.metaCredentials);
  const connected = new Set(creds.map((c) => c.organizationId));

  return orgs.map((o) => ({
    id: o.id,
    name: o.name,
    whatsappConnected: connected.has(o.id),
  }));
}

/** Archiva (soft-delete) un workspace: deja de contar contra el plan, conserva sus datos. */
export async function archiveAgencyWorkspace(
  agencyId: string,
  organizationId: string
): Promise<boolean> {
  const db = getDb();
  const result = await db
    .update(schema.organization)
    .set({ archivedAt: new Date() })
    .where(
      and(
        eq(schema.organization.id, organizationId),
        eq(schema.organization.agencyId, agencyId)
      )
    )
    .returning({ id: schema.organization.id });
  return result.length > 0;
}

function planLabel(plan: "starter" | "growth" | "scale"): string {
  return { starter: "Starter", growth: "Growth", scale: "Scale" }[plan];
}
