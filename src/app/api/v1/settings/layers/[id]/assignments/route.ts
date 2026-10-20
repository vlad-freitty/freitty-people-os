import { readJson, route } from "@/server/http";
import { setLayerAssignments } from "@/server/services/calendar";

export const PUT = route<{ id: string }>(async ({ actor, req, params }) => setLayerAssignments(actor, params.id, await readJson(req)));
