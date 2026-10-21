import { readJson, route } from "@/server/http";
import { deleteCompany, upsertCompany } from "@/server/services/org";

export const PATCH = route<{ id: string }>(async ({ actor, req, params }) => upsertCompany(actor, await readJson(req), params.id));
export const DELETE = route<{ id: string }>(({ actor, params }) => deleteCompany(actor, params.id));
