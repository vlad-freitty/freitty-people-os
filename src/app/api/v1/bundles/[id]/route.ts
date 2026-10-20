import { readJson, route } from "@/server/http";
import { upsertBundle } from "@/server/services/systems";

export const PATCH = route<{ id: string }>(async ({ actor, req, params }) => upsertBundle(actor, await readJson(req), params.id));
