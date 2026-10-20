import { readJson, route } from "@/server/http";
import { assignRole } from "@/server/services/roles";

export const PUT = route<{ id: string }>(async ({ actor, req, params }) => {
  const body = (await readJson(req)) as { roleId?: string };
  return assignRole(actor, params.id, body.roleId ?? "");
});
