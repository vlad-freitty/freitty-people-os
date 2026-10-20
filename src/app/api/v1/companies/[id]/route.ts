import { readJson, route } from "@/server/http";
import { upsertCompany } from "@/server/services/org";

export const PATCH = route<{ id: string }>(async ({ actor, req, params }) => upsertCompany(actor, await readJson(req), params.id));
