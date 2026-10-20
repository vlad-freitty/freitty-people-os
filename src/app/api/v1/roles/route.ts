import { readJson, route } from "@/server/http";
import { createRole, listRoles } from "@/server/services/roles";

export const GET = route(({ actor }) => listRoles(actor));
export const POST = route(async ({ actor, req }) => createRole(actor, await readJson(req)));
