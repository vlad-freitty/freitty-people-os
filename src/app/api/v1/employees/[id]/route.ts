import { readJson, route } from "@/server/http";
import { deleteEmployee, getEmployee, updateEmployee } from "@/server/services/employees";

type P = { id: string };

export const GET = route<P>(({ actor, params }) => getEmployee(actor, params.id));
export const PATCH = route<P>(async ({ actor, req, params }) => updateEmployee(actor, params.id, await readJson(req)));
export const DELETE = route<P>(({ actor, params }) => deleteEmployee(actor, params.id));
