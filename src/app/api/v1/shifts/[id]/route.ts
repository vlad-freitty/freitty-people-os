import { readJson, route } from "@/server/http";
import { deleteShift, updateShift } from "@/server/services/shifts";

type P = { id: string };

export const PATCH = route<P>(async ({ actor, req, params }) => updateShift(actor, params.id, await readJson(req)));
export const DELETE = route<P>(({ actor, params }) => deleteShift(actor, params.id));
