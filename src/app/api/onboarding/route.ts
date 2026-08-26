import { withAuth } from "@/lib/api";
import { getOnboardingStatus } from "@/server/onboarding/status";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const status = await getOnboardingStatus(session.organizationId);
  return Response.json(status);
});
