import { readJson, route } from "@/server/http";
import { deleteDepartment, upsertDepartment } from "@/server/services/org";

export const PATCH = route<{ id: string }>(async ({ actor, req, params }) => upsertDepartment(actor, await readJson(req), params.id));
export const DELETE = route<{ id: string }>(({ actor, params }) => deleteDepartment(actor, params.id));
