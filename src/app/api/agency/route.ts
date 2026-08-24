import { withAuth } from "@/lib/api";
import { getAgencyForUser } from "@/server/agency/credentials";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const agency = await getAgencyForUser(session.organizationId);
  return Response.json({ agency });
});
