import { headers } from "next/headers";
import { apiError, withAuth } from "@/lib/api";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 004 — "Entrar" a un workspace de cliente: cambia la organización activa de
 * la sesión. Delega en el endpoint nativo de Better Auth (set-active), que ya
 * valida que el usuario tenga membresía en esa organización.
 */
export const POST = withAuth(async (_session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const auth = getAuth();
  try {
    await auth.api.setActiveOrganization({
      body: { organizationId: id },
      headers: await headers(),
    });
  } catch {
    return apiError(
      403,
      "forbidden",
      "No tienes acceso a ese workspace"
    );
  }
  return Response.json({ ok: true });
});
