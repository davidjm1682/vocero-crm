import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  createAgencyWorkspace,
  getAgencyForUser,
  listAgencyWorkspaces,
  PlanLimitReachedError,
} from "@/server/agency/credentials";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const agency = await getAgencyForUser(session.organizationId);
  if (!agency) return Response.json({ workspaces: [] });
  const workspaces = await listAgencyWorkspaces(agency.id);
  return Response.json({ workspaces });
});

const postSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const POST = withAuth(async (session, req: Request) => {
  const agency = await getAgencyForUser(session.organizationId);
  if (!agency) {
    return apiError(
      403,
      "no_agency",
      "Tu organización no pertenece a ninguna agencia"
    );
  }

  const body = await parseBody(req, postSchema);
  if (!body.ok) return body.response;

  try {
    const workspace = await createAgencyWorkspace(agency.id, body.data.name);
    return Response.json({ workspace }, { status: 201 });
  } catch (err) {
    if (err instanceof PlanLimitReachedError) {
      return apiError(409, "plan_limit_reached", err.message);
    }
    throw err;
  }
});
