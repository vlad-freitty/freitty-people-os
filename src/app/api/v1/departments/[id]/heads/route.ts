import { readJson, route } from "@/server/http";
import { setDepartmentHeads } from "@/server/services/org";

export const PUT = route<{ id: string }>(async ({ actor, req, params }) => {
  const body = (await readJson(req)) as { employeeIds?: string[] };
  return setDepartmentHeads(actor, params.id, body.employeeIds ?? []);
});
