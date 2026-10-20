import { readJson, route } from "@/server/http";
import { upsertSystem } from "@/server/services/systems";

export const PATCH = route<{ id: string }>(async ({ actor, req, params }) => upsertSystem(actor, await readJson(req), params.id));
