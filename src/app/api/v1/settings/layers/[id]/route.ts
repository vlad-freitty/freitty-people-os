import { readJson, route } from "@/server/http";
import { deleteLayer, upsertLayer } from "@/server/services/calendar";

type P = { id: string };

export const PATCH = route<P>(async ({ actor, req, params }) => upsertLayer(actor, await readJson(req), params.id));
export const DELETE = route<P>(({ actor, params }) => deleteLayer(actor, params.id));
