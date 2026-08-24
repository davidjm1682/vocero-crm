import { apiError, withAuth } from "@/lib/api";
import { archiveAgencyWorkspace, getAgencyForUser } from "@/server/agency/credentials";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const POST = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const agency = await getAgencyForUser(session.organizationId);
  if (!agency) {
    return apiError(403, "no_agency", "Tu organización no pertenece a ninguna agencia");
  }
  const archived = await archiveAgencyWorkspace(agency.id, id);
  if (!archived) {
    return apiError(404, "not_found", "Workspace no encontrado en tu agencia");
  }
  return Response.json({ ok: true });
});
