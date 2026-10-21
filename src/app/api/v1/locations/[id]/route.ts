import { readJson, route } from "@/server/http";
import { deleteLocation, upsertLocation } from "@/server/services/org";

export const PATCH = route<{ id: string }>(async ({ actor, req, params }) => upsertLocation(actor, await readJson(req), params.id));
export const DELETE = route<{ id: string }>(({ actor, params }) => deleteLocation(actor, params.id));
