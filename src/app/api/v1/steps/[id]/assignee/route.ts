import { readJson, route } from "@/server/http";
import { reassignStep } from "@/server/requests/engine";

export const PUT = route<{ id: string }>(async ({ actor, req, params }) => {
  const body = (await readJson(req)) as { assigneeId?: string };
  return reassignStep(actor, params.id, body.assigneeId ?? "");
});
