import { readJson, route } from "@/server/http";
import { upsertDepartment } from "@/server/services/org";

export const POST = route(async ({ actor, req }) => upsertDepartment(actor, await readJson(req)));
