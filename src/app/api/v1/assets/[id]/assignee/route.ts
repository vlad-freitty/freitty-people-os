import { readJson, route } from "@/server/http";
import { assignAsset } from "@/server/services/assets";

/** Body: {employeeId: string | null} — null returns the asset. */
export const PUT = route<{ id: string }>(async ({ actor, req, params }) => {
  const body = (await readJson(req)) as { employeeId?: string | null };
  return assignAsset(actor, params.id, body.employeeId ?? null);
});
