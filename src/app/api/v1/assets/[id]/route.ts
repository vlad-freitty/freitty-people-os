import { readJson, route } from "@/server/http";
import { upsertAsset } from "@/server/services/assets";

export const PATCH = route<{ id: string }>(async ({ actor, req, params }) => upsertAsset(actor, await readJson(req), params.id));
