import { readJson, route } from "@/server/http";
import { deleteRole, updateRole } from "@/server/services/roles";

type P = { id: string };

export const PATCH = route<P>(async ({ actor, req, params }) => updateRole(actor, params.id, await readJson(req)));
export const DELETE = route<P>(({ actor, params }) => deleteRole(actor, params.id));
