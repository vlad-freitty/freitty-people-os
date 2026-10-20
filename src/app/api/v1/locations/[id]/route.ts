import { readJson, route } from "@/server/http";
import { upsertLocation } from "@/server/services/org";

export const PATCH = route<{ id: string }>(async ({ actor, req, params }) => upsertLocation(actor, await readJson(req), params.id));
