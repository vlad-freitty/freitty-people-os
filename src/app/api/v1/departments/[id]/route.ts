import { readJson, route } from "@/server/http";
import { upsertDepartment } from "@/server/services/org";

export const PATCH = route<{ id: string }>(async ({ actor, req, params }) => upsertDepartment(actor, await readJson(req), params.id));
