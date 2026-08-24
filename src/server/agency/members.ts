import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";

/**
 * 004 — Membresía multi-organización: reutiliza `member` (ya N:N usuario↔
 * organización en Better Auth) en vez de un sistema de permisos paralelo.
 * Un miembro de agencia tiene una fila `member` por cada workspace de
 * cliente de su agencia.
 */

export async function addMemberToWorkspace(
  userId: string,
  organizationId: string,
  role: string
): Promise<void> {
  const db = getDb();
  await db.insert(schema.member).values({
    id: newId("member"),
    organizationId,
    userId,
    role,
  });
}

/** Da acceso a un workspace nuevo a todos los miembros actuales de la agencia. */
export async function grantAgencyMembersToWorkspace(
  agencyId: string,
  newOrganizationId: string
): Promise<void> {
  const db = getDb();
  const orgs = await db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .where(eq(schema.organization.agencyId, agencyId));
  const orgIds = orgs.map((o) => o.id).filter((id) => id !== newOrganizationId);
  if (orgIds.length === 0) return;

  // Un usuario puede repetirse entre workspaces (mismo miembro en varios);
  // deduplicar antes de insertar para no violar ninguna expectativa de
  // unicidad futura y no hacer trabajo redundante.
  const seen = new Set<string>();
  for (const orgId of orgIds) {
    const members = await db
      .select({ userId: schema.member.userId, role: schema.member.role })
      .from(schema.member)
      .where(eq(schema.member.organizationId, orgId));
    for (const m of members) {
      if (seen.has(m.userId)) continue;
      seen.add(m.userId);
      await addMemberToWorkspace(m.userId, newOrganizationId, m.role);
    }
  }
}
