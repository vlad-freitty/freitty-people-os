import { readJson, route } from "@/server/http";
import { upsertPolicy } from "@/server/services/absences";

export const PATCH = route<{ id: string }>(async ({ actor, req, params }) => upsertPolicy(actor, await readJson(req), params.id));
